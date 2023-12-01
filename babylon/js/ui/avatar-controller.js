class AvatarAnimation {
  constructor(avatar) {
    this.avatar = avatar;

    this.animationNames = [];

    this.animations = {
      walk: {
        substring: 'walk',
        preferredSubstring: 'place', // like 'walk_in_place'
        avoid: ['left', 'right', 'back']
      },
      walkLeft: { substring: 'walk', preferredSubstring: 'left' },
      walkRight: { substring: 'walk', preferredSubstring: 'right' },
      walkBack: { substring: 'walk', preferredSubstring: 'back' },
      idle: {
        substring: 'idle',
        useShortest: true
      },
      run: {
        substring: 'run',
        useShortest: true
      }
    }
    this.improvise = false;
    this.otherAnimations = [];
    this.processAnimations();
  }
  /**
   * Called from constructor to find walk and idle animations.
   */
  processAnimations() {
    this.avatar.getAnimationGroups().forEach( a => {
      this.animationNames.push(a.name)
      //console.log(a);
      var name = a.name.toLowerCase();
      for ( const ruleName in this.animations ) {
        let rule = this.animations[ruleName];
        let matches = false;
        if ( name.indexOf( rule.substring ) >= 0 ) {
          // animation matches
          if ( this.animations[ruleName].group ) {
            // animation already exists, replacement rules follow
            matches |= rule.preferredSubstring && name.indexOf(rule.preferredSubstring) >= 0;
            matches |= rule.useShortest && this.animations[ruleName].group.name.length > name.length;
          } else {
            // first match
            matches = true;
          }
          if (rule.avoid) {
            rule.avoid.forEach( word => matches &= name.indexOf(word) == -1 )
          }
        }
        if ( matches ) {
          this.animations[ruleName].group = a;
        } else {
          this.otherAnimations.push(a);
        }
      }
    });
    console.log("Animations recognized: ", this.animations);
  }
  
  contains(name) {
    return this.animationNames.includes(name);
  }
  
  walk() {
    return this.animations.walk.group;
  }

  idle() {
    return this.animations.idle.group;
  }
  
  processText(text) {
    if ( this.improvise ) {
      // process text and try to find some meaninful animation
      var words = text.split(' ');
      for ( var word of words ) {
        if ( word.length > 1 ) {
          var match = this.otherAnimations.find( e => e.name.includes(word.toLowerCase()));
          if ( match ) {
            return match;
          }
        }
      }
    }
    return null;
  }
    
}

class AvatarMovement {
  constructor(world, avatar, animation) {
    this.world = world;
    this.avatar = avatar;
    this.animation = animation;
     // world manager mesh
    this.movementTracker = BABYLON.MeshBuilder.CreateSphere("avatar movement tracker", {diameter:0.1}, this.world.scene);
    this.movementTracker.isVisible = false;
    //this.movementTracker.ellipsoid = null;
    
    this.trackingCameraRotation = false;
    this.vector = {
      left: new BABYLON.Vector3(1, 0, 0),
      right: new BABYLON.Vector3(-1, 0, 0),
      forward: new BABYLON.Vector3(0, 0, -1),
      back: new BABYLON.Vector3(0, 0, 1),
      up: new BABYLON.Vector3(0, .5, 0),
      down: new BABYLON.Vector3(0, -1, 0)
    };
    this.stop();
    this.trackWalk = true;
    this.findFeet();
    this.stepLength = 0;
  }
  
  findFeet() {
    // we need both feet to determine step length
    this.trackWalk &= (this.avatar.body.leftLeg.foot.length > 0) && (this.avatar.body.rightLeg.length > 0);
    if (this.trackWalk) {
      this.leftFoot = this.avatar.skeleton.bones[this.avatar.body.leftLeg.foot[0]].getTransformNode();
      this.rightFoot = this.avatar.skeleton.bones[this.avatar.body.rightLeg.foot[0]].getTransformNode();
    }
  }

  stop() {
    this.timestamp = 0;
    this.movingDirections = 0;
    this.direction = new BABYLON.Vector3(0,0,0);
    this.movingToTarget = false;
    this.movementTarget = null;
    this.xDist = null;
    this.zDist = null;
    this.movementTimeout = 5000;
    this.state = {
      left: false,
      right: false,
      forward: false,
      back: false,
      up: false
    }
  }

  startAnimation(animation) {
    if ( animation != null ) {
      this.avatar.startAnimation(animation.name, true);
      this.activeAnimation = animation;
    }
  }

  setSpeed(speed) {
    if ( this.animation.animations.walk && this.stepLength > 0 ) {
      // assuming full animation cycle is one step with each leg
      let cycles = 1/(2*this.stepLength); // that many animation cycles to walk 1m
      this.animation.walk().speedRatio = 1; // need to get right duration
      let cycleDuration = this.animation.walk().getLength();
      // so to cross 1m in 1s,
      let animationSpeed = cycles/cycleDuration;
      // but in babylon, camera speed 1 means 10m/s
      this.animation.walk().speedRatio = animationSpeed*speed*10;
    }
  }
  
  addVector(direction) {
    if ( !this.state[direction] ) {
      if ( this.movingToTarget ) {
        this.stopMovement();
      }
      if ( this.movingDirections == 0 ) {
        // movement just starting
        this.startMovement();
      }
      this.direction.addInPlace( this.vector[direction] );
      this.state[direction] = true;
      this.movingDirections++;
    }
  }
  
  removeVector(direction) {
    if ( this.state[direction] ) {
      this.direction.subtractInPlace( this.vector[direction] );
      this.state[direction] = false;
      this.movingDirections--;
    }
    if ( this.movingDirections === 0 ) {
      this.stopMovement();
    }
  }

  stopMovement() {
    this.stop();
    //console.log("movement stopped, step length "+this.stepLength);
    this.startAnimation(this.animation.idle());
  }
  
  stopTrackingCameraRotation() {
    if ( this.applyRotationToMesh ) {
      this.world.scene.unregisterBeforeRender( this.applyRotationToMesh );
      this.applyRotationToMesh = null;
      this.trackingCameraRotation = false;
    }
  }

  startTrackingCameraRotation() {
    if ( ! this.applyRotationToMesh ) {
      this.applyRotationToMesh = () => {
        //console.log("avatar turnaround: "+this.avatar.turnAround);
        let ref = .5;
        if ( this.avatar.turnAround ) {
          ref = 1.5;
        }
        let rotY = ref*Math.PI-this.world.camera3p.alpha;
        // convert alpha and beta to mesh rotation.y and rotation.x
        this.avatar.parentMesh.rotationQuaternion = new BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y,rotY);
        this.movementTracker.rotation.y = rotY;
      }
      this.world.scene.registerBeforeRender( this.applyRotationToMesh );
      this.trackingCameraRotation = true;
    }
  }
  
  startMovement() {
    this.timestamp = Date.now();
    this.movementStart = Date.now();
    this.setSpeed(this.world.camera1p.speed);
    this.startAnimation(this.animation.walk());
  }
  
  moveToTarget(point) {
    if ( this.movingDirections > 0 ) {
      return;
    }
    if ( this.movingToTarget ) {
      //this.stopMovement();
      this.timestamp = Date.now();
      this.movementStart = Date.now();
      this.xDist = null;
      this.zDist = null;
    } else {
      this.startMovement();
      this.movingToTarget = true;
    }
    this.movementTarget = new BABYLON.Vector3(point.x, point.y, point.z);
    this.direction = this.movementTarget.subtract(this.avatar.parentMesh.position);
    //this.stopTrackingCameraRotation();
    //console.log("moving to target ", point, " direction "+this.direction);
    
    let currentDirection = new BABYLON.Vector3(0,0,-1);
    if ( this.avatar.turnAround ) {
      currentDirection = new BABYLON.Vector3(0,0,1);
    }
    currentDirection.rotateByQuaternionToRef(this.avatar.parentMesh.rotationQuaternion,currentDirection);
    let rotationMatrix = new BABYLON.Matrix();
    BABYLON.Matrix.RotationAlignToRef(currentDirection.normalizeToNew(), this.direction.normalizeToNew(), rotationMatrix);
    let quat = BABYLON.Quaternion.FromRotationMatrix(rotationMatrix);

    //this.stopTrackingCameraRotation(); // to test avatar rotation animation
    if ( this.trackingCameraRotation ) {
      // rotate 3p camera
      let angle = quat.toEulerAngles().y;
      if ( ! this.cameraAnimation ) {
        this.cameraAnimation = new BABYLON.Animation("camera-rotation-alpha", "alpha", 5, BABYLON.Animation.ANIMATIONTYPE_FLOAT);
        this.world.camera3p.animations.push(this.cameraAnimation);
      }
  
      let keys = [ 
        {frame: 0, value: this.world.camera3p.alpha},
        {frame: 1,value: this.world.camera3p.alpha-angle}
      ];
  
      this.cameraAnimation.setKeys(keys);
      this.world.scene.beginAnimation(this.world.camera3p, 0, 10, false, 1);
      
    } else {
      // rotate avatar
      //this.avatar.parentMesh.rotationQuaternion.multiplyInPlace(quat);
      if ( ! this.avatarRotationAnimation ) {
        this.avatarRotationAnimation = VRSPACEUI.createQuaternionAnimation(this.avatar.parentMesh, "rotationQuaternion", 5);
      }
      VRSPACEUI.updateQuaternionAnimation(this.avatarRotationAnimation, this.avatar.parentMesh.rotationQuaternion.clone(), this.avatar.parentMesh.rotationQuaternion.multiply(quat));
    }
  }

  moveAvatar() {
    if ( this.world.scene.activeCamera !== this.world.camera3p 
       //|| (this.movingDirections == 0 && !this.movingToTarget) // disables free fall
      )
    {
      return;
    }

    if ( this.movingToTarget && this.movementStart + this.movementTimeout < this.timestamp ) {
      // could not reach the destination, stop
      console.log("Stopping movement due to timeout");
      this.stopMovement();
      return;
    }
    var old = this.timestamp;
    this.timestamp = Date.now();
    var delta = (this.timestamp - old)/100;
    //var distance = this.world.camera3p.speed * delta;
    var distance = this.world.camera1p.speed * delta; // v=s/t, s=v*t
    var gravity = new BABYLON.Vector3(0,this.world.scene.gravity.y,0); //.scale(delta);

    var direction = this.direction.clone().normalize().scale(distance).add(gravity);
    
    var avatarMesh = this.avatar.parentMesh;
    
    if ( this.movingDirections > 0 ) {
      var angle = -1.5*Math.PI-this.world.camera3p.alpha;
      var rotation = BABYLON.Quaternion.RotationAxis( BABYLON.Axis.Y, angle);
      direction.rotateByQuaternionToRef( rotation, direction );
      avatarMesh.moveWithCollisions(direction);
    } else if ( this.movingToTarget ) {
      var xDist = Math.abs(avatarMesh.position.x - this.movementTarget.x);
      var zDist = Math.abs(avatarMesh.position.z - this.movementTarget.z);
      if ( xDist < 0.2 && zDist < 0.2) {
        console.log("Arrived to destination: "+avatarMesh.position);
        this.stopMovement();
      } else if ( this.xDist && this.zDist && xDist > this.xDist && zDist > this.zDist ) {
        console.log("Missed destination: "+avatarMesh.position+" by "+xDist+","+zDist);
        this.stopMovement();
      } else {
        avatarMesh.moveWithCollisions(direction);
        this.xDist = xDist;
        this.zDist = zDist;
      }
    } else {
      // only apply gravity
      avatarMesh.moveWithCollisions(direction);
    }
    this.movementTracker.position = avatarMesh.position;
    if ( this.trackWalk ) {
      let length = this.leftFoot.getAbsolutePosition().subtract(this.rightFoot.getAbsolutePosition()).length();
      if ( length > this.stepLength ) {
        this.stepLength = length;
        this.setSpeed(this.world.camera1p.speed);
      }
    }
  }

  dispose() {
    this.stopTrackingCameraRotation();
    if ( this.cameraAnimation ) {
      let pos = this.world.camera3p.animations.indexOf(this.cameraAnimation);
      if ( pos > -1 ) {
        this.world.camera3p.animations.splice(pos,1);
      }
    }
  }
}

/**
This is remote control for user's avatar. Installed as change listener to WorldManager, tracks position of all events that user 
sends - typically movement - and optinally adds some more - typically avatar animations.
E.g. when position changes, it sends 'walk' animation, if current avatar has animation named 'walk'.
User stops, it sends 'idle' animation, if current avatar has animation named 'idle'.
So all other users see this avatar moving and idling. 
 */
export class AvatarController {
  constructor( worldManager, avatar ) {
    /** Timestamp of last change */
    this.lastChange = Date.now();
    /** After not receiving any events for this many millis, idle animation starts */
    this.idleTimeout = 200;
    this.lastAnimation = null;
    this.worldManager = worldManager;
    this.world = worldManager.world;
    this.scene = worldManager.scene;
    this.avatar = avatar;

    //if ( this.world.camera3p ) {
      //this.world.camera3p.setTarget(avatar.headPosition);
    //}
    
    avatar.parentMesh.ellipsoidOffset = new BABYLON.Vector3(0,1,0);
    
    this.animation = new AvatarAnimation(avatar);
    
    this.setupIdleTimer();
    // event handlers
    this.keyboardHandler = (kbInfo) => this.handleKeyboard(kbInfo);
    this.cameraHandler = () => this.cameraChanged();
    this.scene.onActiveCameraChanged.add(this.cameraHandler);
    // movement state variables and constants
    this.movement = new AvatarMovement(this.world, avatar, this.animation);
    this.movementHandler = () => this.movement.moveAvatar();
    this.clickHandler = (pointerInfo) => this.handleClick(pointerInfo);

    this.cameraChanged();
  }
  
  /**
   * Create timer for idle animation, if it doesn't exist.
   */
  setupIdleTimer() {
    if ( this.idleTimerId ) {
      return;
    }
    this.idleTimerId = setInterval(() => {
      if ( this.worldManager.isOnline() && Date.now() - this.lastChange > this.idleTimeout ) {
        clearInterval(this.idleTimerId);
        this.idleTimerId = null;
        this.sendAnimation(this.animation.animations.idle.group, true);
      }
    }, this.idleTimeout);
  }
  /**
   * Send an animation to the server, if the avatar has it.
   * @param animation AnimationGroup to activate remotely
   * @param loop default false
   */
  sendAnimation(animation, loop=false) {
    if ( this.animation.contains(animation.name) && animation.name != this.lastAnimation && this.worldManager.isOnline() ) {
      //console.log("Sending animation "+name+" loop: "+loop);
      this.worldManager.sendMy({animation:{name:animation.name,loop:loop}});
      this.lastAnimation = animation.name;
    }
  }
  /**
  Process locally generated changes to avatar. Called from WorldManager.trackChanges().
  Position changes also change idle animation timer, and wrote event may trigger appropriate animation.
  @param changes array of field,value object pairs
   */
  processChanges(changes) {
    if ( this.worldManager.world.inXR ) {
      // do NOT send anything while in XR
      return;
    }
    for ( var change of changes ) {
      this.lastChange = Date.now();
      if ( change.field == "position" ) {
        this.setupIdleTimer();
        this.sendAnimation(this.animation.walk(),true);
        break;
      } else if ( change.field == "rotation") {
        // CHECKME anything?
      } else if ( change.field == "wrote" ) {
        let animation = this.animation.processText(change.value);
        if ( animation ) {
          this.sendAnimation(this.animation.walk(),false);
        }
      }
    }
  }
  
  cameraChanged() {
    if ( this.scene.activeCamera === this.world.camera3p ) {

      this.world.camera3p.alpha = 1.5*Math.PI-this.world.camera1p.rotation.y;
      
      // TODO: use camera ellipsoid
      let y = this.world.camera1p.position.y - this.world.camera1p.ellipsoid.y - this.world.camera1p.ellipsoidOffset.y;
      this.avatar.parentMesh.position = new BABYLON.Vector3(this.world.camera1p.position.x, y, this.world.camera1p.position.z);
      this.avatar.parentMesh.setEnabled(true);
      this.world.camera3p.setTarget(this.avatar.headPosition);
      this.scene.onKeyboardObservable.add(this.keyboardHandler);
      this.scene.onPointerObservable.add(this.clickHandler);
      this.scene.registerBeforeRender(this.movementHandler);
      
      this.movement.startTrackingCameraRotation();
      this.movement.stopMovement();
      
      this.worldManager.trackMesh(this.movement.movementTracker);
      
    } else {
      this.scene.onKeyboardObservable.remove(this.keyboardHandler);
      this.scene.onPointerObservable.remove( this.clickHandler );
      this.scene.unregisterBeforeRender(this.movementHandler);
      this.movement.stopTrackingCameraRotation();
    }
    if ( this.scene.activeCamera === this.world.camera1p ) {
      this.worldManager.trackMesh(null);
      this.avatar.parentMesh.setEnabled(false);
      // apply rotation to 1st person camera
      this.world.camera1p.rotation.z = 0;
      this.world.camera1p.rotation.y = 1.5*Math.PI-this.world.camera3p.alpha;
      this.world.camera1p.rotation.x = 0;
    }
  }
  
  handleKeyboard(kbInfo) {
    if (this.scene.activeCamera !== this.world.camera3p) {
      return;
    }
    switch (kbInfo.type) {
      case BABYLON.KeyboardEventTypes.KEYDOWN:
        switch (kbInfo.event.key) {
          case "a":
          case "A":
          case "ArrowLeft":
            this.movement.addVector('left');
            break;
          case "d":
          case "D":
          case "ArrowRight":
            this.movement.addVector('right');
            break;
          case "w":
          case "W":
          case "ArrowUp":
            this.movement.addVector('forward');
            break;
          case "s":
          case "S":
          case "ArrowDown":
            this.movement.addVector('back');
            break;
          case "PageUp":
          case " ":
            this.movement.addVector('up');
            break;
          default:
            break;
        }
        break;
      case BABYLON.KeyboardEventTypes.KEYUP:
        switch (kbInfo.event.key) {
          case "a":
          case "A":
          case "ArrowLeft":
            this.movement.removeVector('left');
            break;
          case "d":
          case "D":
          case "ArrowRight":
            this.movement.removeVector('right');
            break;
          case "w":
          case "W":
          case "ArrowUp":
            this.movement.removeVector('forward');
            break;
          case "s":
          case "S":
          case "ArrowDown":
            this.movement.removeVector('back');
            break;
          case "PageUp":
          case " ":
            this.movement.removeVector('up');
            break;
          default:
            break;
        }
        break;
    }
  }

  handleClick(pointerInfo) {
    if (pointerInfo.type == BABYLON.PointerEventTypes.POINTERUP ) {
      //console.log(pointerInfo);
      // LMB: 0, RMB: 2
      if (pointerInfo.pickInfo.pickedMesh) {
        if (pointerInfo.event.button == 0 && this.world.getFloorMeshes().includes(pointerInfo.pickInfo.pickedMesh)) {
          this.movement.moveToTarget(pointerInfo.pickInfo.pickedPoint);
        }
      }
    }
  }

  // TODO
  dispose() {
    this.scene.onKeyboardObservable.remove(this.keyboardHandler);
    this.scene.onPointerObservable.remove( this.clickHandler );
    this.scene.unregisterBeforeRender(this.movementHandler);
    this.movement.dispose();
  }
}