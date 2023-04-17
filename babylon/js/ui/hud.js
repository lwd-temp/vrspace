import {SpeechInput} from './speech-input.js';
/**
HUD stands for head-up display - a UI container mounted on users head.
Typically we have some buttons around 50 cm front, 10-20 cm below line of sight.
This is common UI supposed to be usefull on VR devices, PC and mobiles, but likely to be suboptimal - UI specifically designed for a device should be more ergonomic.
By default it tracks active camera, and binds to new camera whenever active camera changes,
e.g. upon entering/exiting VR. Constructed with a camera parameter, it does not rebound to a new one,
e.g. switching from first-person view to god mode activates a different HUD.
 */
export class HUD {
  /** @param scene babylonjs scene */
  /** @param camera to track, by default tracks active camera */
  constructor( scene, camera ) {
    // parameters
    this.scene = scene;
    this.onlyCamera = camera;
    // constants
    this.buttonSize = .05;
    this.buttonSpacing = 0.025;
    this.alpha=0.7; // button opacity
    this.distanceWeb = .5;
    this.distanceXR = .4; // FIXME this is too close, visual issues
    this.verticalWeb = -0.1;
    this.verticalXR = -0.1;
    this.rowOffset = new BABYLON.Vector3(0,this.verticalWeb,0);
    // state variables
    this.vrHelper = null; // set by World.InitXR();
    this.speechInput = new SpeechInput();
    this.speechInput.onlyLetters = false;
    this.speechInput.addNoMatch((phrases)=>console.log('no match:',phrases));
    this.currentController = null;
    this.scale = 1;
    this.activeControl = null;
    scene.onActiveCameraChanged.add( () => this.trackCamera() );
    this.guiManager = new BABYLON.GUI.GUI3DManager(this.scene);
    this.elements = [];
    this.controls = [];
    this.textures = [];
    this.root = new BABYLON.TransformNode("HUD");
    this.root.position = new BABYLON.Vector3(0,this.verticalWeb,this.distanceWeb);
    this.rowRoot = new BABYLON.TransformNode("HUD0");
    this.rowRoot.parent = this.root;
    this.rows = [{root: this.rowRoot, elements: this.elements, controls: this.controls, textures: this.textures, speechInput: this.speechInput, activeControl: this.activeControl}];
    window.addEventListener("resize", () => {
      this.rescaleHUD();
    });
    this.trackCamera();
  }
  /**
  Handles camera change events, typically while entering/exiting VR.
   */
  trackCamera() {
    console.log("HUD tracking camera: "+this.scene.activeCamera.getClassName()+" new position "+this.scene.activeCamera.position);
    this.camera = this.scene.activeCamera;
    this.rescaleHUD();
    if ( this.camera ) {
      if ( this.onlyCamera ) {
       if ( this.camera == this.onlyCamera ) {
          // TODO activate this HUD
        } else {
          // TODO deactivate this HUD
        }
      } else {
        this.attachToCamera();
      }
      
    }
  }
  attachToCamera() {
    this.root.parent = this.camera;
    this.root.position = new BABYLON.Vector3(0,this.vertical(),this.distance());
    this.root.rotation = new BABYLON.Vector3(0,0,0);
    this.rowOffset = new BABYLON.Vector3(0,this.verticalWeb,0);
  }
  /** Returns true if XR mode is active (current camera is WebXRCamera) */
  inXR() {
    return this.camera && "WebXRCamera" == this.camera.getClassName();
  }
  
  /** Returns vertical position of the HUD */
  vertical() {
    if ( this.inXR() ) {
      return this.verticalXR;
    } else {
      return this.verticalWeb;
    }
  }
  /** Returns distance of the HUD from the camera*/
  distance() {
    if ( this.inXR() ) {
      return this.distanceXR;
    } else {
      return this.distanceWeb;
    }
  }
  /**
  Window.resize event handler, rescales the HUD if aspect ratio is too small for all buttons to fit.
   */
  rescaleHUD() {
    var aspectRatio = this.scene.getEngine().getAspectRatio(this.scene.activeCamera);
    // TODO exactly calculate aspect ratio depending on number of buttons, size, spacing
    // 0.75 (10 buttons) on this distance fits at aspect of 2
    var requiredRatio = this.elements.length/10*2;
    this.scale = Math.min(1, aspectRatio/requiredRatio);
    this.root.scaling = new BABYLON.Vector3(this.scale,this.scale,1);
    //console.log("Aspect ratio: "+aspectRatio+" HUD scaling: "+this.scale);
  }
  
  makeRoomForMore() {
	  // TODO take variable size of elements into account
    var width = this.buttonSize+this.buttonSpacing;
    this.elements.forEach(b=>{
      b.position.x = b.position.x - width/2;
    });
    if ( this.input ) {
		  width += .4;
	  }
    return width;
  }
  
  /**
  Create a button with given text and image and add it to the HUD
  @param text description to display
  @param imageUrl image to display
  @param onPointerDown callback function activated when pressed
  @returns a BabylonJS HolographicButton
   */
  addButton(text, imageUrl, onPointerDown) {
    var width = this.makeRoomForMore();
    
    var button = new BABYLON.GUI.HolographicButton(text+"Button");
    this.guiManager.addControl(button);
    button.imageUrl = imageUrl;
    button.text=text;
    button.position = new BABYLON.Vector3(this.elements.length*width/2,0,0);
    button.scaling = new BABYLON.Vector3( this.buttonSize, this.buttonSize, this.buttonSize );
    button.mesh.parent = this.rowRoot;
    this.elements.push(button);
    this.controls.push(button);
    button.backMaterial.alpha = this.alpha;
    this.rescaleHUD();
    if ( onPointerDown ) {
      button.onPointerDownObservable.add( (vector3WithInfo) => onPointerDown(button, vector3WithInfo) );
    }
    //button.onPointerEnterObservable.add( (control) => this.pointerEnter(button) );
    //button.onPointerOutObservable.add( (control) => this.pointerOut(button) );
    if ( text ) {
      this.speechInput.addCommand(text, () => {
        // execute click callback(s) on visible button
        this.activateButton(button);
      });
    }
    return button;
  }

  activateButton(button) {
    if ( button.isVisible ) {
      button.onPointerDownObservable.observers.forEach(observer=>observer.callback(button))
    }
  }  
  pointerEnter(button) {
    //console.log('enter '+button.pointerEnterAnimation);
    button.scaling = new BABYLON.Vector3( this.buttonSize*1.2, this.buttonSize*1.2, this.buttonSize*1.2 );
  }
  pointerOut(button) {
    //console.log('out '+button.pointerOutAnimation);
    button.scaling = new BABYLON.Vector3( this.buttonSize, this.buttonSize, this.buttonSize );
  }
  getControlIndex(control) {
    for ( let i = 0; i < this.controls.length; i++ ) {
      if ( this.controls[i] === control ) {
        return i;
      }
    }
    return -1;
  }
  unselectCurrent() {
    if ( this.activeControl && this.activeControl.getClassName() == "HolographicButton") {
      this.activeControl.pointerOutAnimation();
    }
  }
  selectCurrent() {
    if ( this.activeControl && this.activeControl.getClassName() == "HolographicButton") {
      this.activeControl.pointerEnterAnimation();
    }
  }
  selectControl(index) {
    if ( index < 0 ) {
      index = this.controls.length + index;
    }
    index = index % this.controls.length;
    //console.log("Current control: "+index+"/"+this.controls.length);
    this.unselectCurrent();
    this.activeControl = this.controls[index];
    this.selectCurrent();
  }
  up() {
    if ( this.activeControl ) {
      if ( this.activeControl.getClassName() == "HolographicButton") {
        //this.activeControl.pointerDownAnimation();
        //this.activeControl.pointerUpAnimation();
        //this.activeControl.pointerOutAnimation();
        this.activateButton(this.activeControl);
      }
    }
  }
  down() {
    if ( this.rows.length > 1 ) {
      let previous = this.rows[this.rows.length-2];
      if ( previous.activeControl && previous.activeControl.getClassName() == "HolographicButton") {
        this.activateButton(previous.activeControl);
      }
    }
  }
  left() {
    this.selectControl(this.getControlIndex(this.activeControl)-1);
  }
  right() {
    this.selectControl(this.getControlIndex(this.activeControl)+1);
  }
  /**
   * Adds a panel (typically babylon StackPanel) to the hud. Creates and returns AdvancedDynamicTexture to render the panel.
   * @param panel to add
   * @param textureWidth width in pixels
   * @param textureHeight height in pixels
   */
  addPanel(panel,textureWidth,textureHeight) {
	  let size = 0.03 * this.scale * textureHeight/64;

    let plane = BABYLON.MeshBuilder.CreatePlane("Plane-TextInput", {width: size*textureWidth/textureHeight, height: size});
    plane.parent = this.rowRoot;
    plane.position = new BABYLON.Vector3(0,size/2,0.02);
    let advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane,textureWidth,textureHeight);
    // advancedTexture creates material and attaches it to the plane
    plane.material.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
    
    advancedTexture.addControl(panel);

    this.elements.push(plane);
    this.controls.push(panel);
    this.textures.push(advancedTexture);
    
    this.rescaleHUD();
    return advancedTexture;
  }
  
  /**
  Adds a slider to the HUD.
  @return babylon Slider object
   */
  addSlider(text="Value",min,max,value=0) {
    var width = this.makeRoomForMore();

    var plane = BABYLON.MeshBuilder.CreatePlane("Plane-Slider:"+text, {width: 0.07, height: 0.07});
    plane.parent = this.rowRoot;
    //plane.position.z = 0.02;
    plane.position = new BABYLON.Vector3(this.elements.length*width/2,0,0.02);

    var advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane,256,256);

    var panel = new BABYLON.GUI.StackPanel();
    panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    advancedTexture.addControl(panel);
    this.textures.push(advancedTexture);

    var header = new BABYLON.GUI.TextBlock("Text-Slider:"+text);
    header.text = text+": "+value;
    header.height = "30px";
    header.color = "white";
    panel.addControl(header); 

    var slider = new BABYLON.GUI.Slider("Slider:"+text);
    slider.minimum = min;
    slider.maximum = max;
    slider.value = value;
    slider.isVertical = true;
    slider.height = "220px";
    slider.width = "20px";
    slider.onValueChangedObservable.add((value) =>{
        header.text = text+": "+value;
    });
    panel.addControl(slider);
    this.elements.push(plane);
    this.controls.push(panel);
    
    if ( text ) {
      this.speechInput.addCommand(text+" *value", (value) => {
        console.log("setting "+text+" to "+value);
        if ( "one" == value ) {
          value = "1";
        } else if ( "zero" == value ) {
          value = "0";
        }
        if ( isNaN(value)) {
          console.log('Unrecognized input value: '+value);
        } else {
          let num = parseFloat(value);
          if ( num > slider.maximum ) {
            slider.value = slider.maximum;
          } else if ( num < slider.minimum ) {
            slider.value = slider.minimum;
          } else {
            slider.value = num;
          }
          header.text = text+": "+value;
        }
      });
    }
    
    return slider;
  }
  /**
  Adds color picker to the HUD.
  @return babylon ColorPicker object
   */
  addColorPicker(text="Color",value=new BABYLON.Color3()) {
    var width = this.makeRoomForMore();
    
    var plane = BABYLON.MeshBuilder.CreatePlane("Plane-Picker:"+text, {width: 0.07, height: 0.07});
    plane.parent = this.rowRoot;
    plane.position = new BABYLON.Vector3(this.elements.length*width/2,0,0);

    var advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane,256,256);
    var panel = new BABYLON.GUI.StackPanel();
    panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    advancedTexture.addControl(panel);
    this.textures.push(advancedTexture);
    
    var header = new BABYLON.GUI.TextBlock("Text-Picker:"+text);
    header.text = text;
    header.height = "30px";
    header.color = "white";
    panel.addControl(header); 

    var picker = new BABYLON.GUI.ColorPicker("Picker:"+text);
    picker.value = value;
    picker.height = "150px";
    picker.width = "150px";
    picker.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

    panel.addControl(picker);
    this.elements.push(plane);
    this.controls.push(panel);

    this.rescaleHUD();
    return picker;
  }

  /**
  Show or hide all HUD elements (buttons)
  @param show show or hide
  @param except optional element(s) to skip
   */
  showButtons(show, ...except) {
    this.controls.forEach( (element) => {
      if ( !except
        // no children - button 
        || (!element.children && !except.includes(element))
        // panel contains text and control 
        || ( element.children && !except.includes(element.children[1]))  
      ) {
        element.isVisible = show;
      }
    });
  }
 
  currentRow() {
    return this.rows[this.rows.length-1];
  } 
  
  newRow() {
    this.rows.forEach(row=>{
      row.root.scaling.scaleInPlace(.5);
      row.root.position.addInPlace(this.rowOffset.scale(1/(this.rows.length*2)));
    });
    this.unselectCurrent();
    this.currentRow().activeControl = this.activeControl;
    this.rowRoot = new BABYLON.TransformNode("HUD"+this.rows.length);
    this.rowRoot.parent = this.root;
    
    this.elements = [];
    this.controls = [];
    this.textures = [];
    this.activeControl = null;
    this.speechInput.stop();
    this.speechInput = new SpeechInput();
    this.speechInput.onlyLetters = false;
    this.rows.push({root: this.rowRoot, elements: this.elements, controls: this.controls, textures: this.textures, speechInput: this.speechInput, activeControl: this.activeControl});
  }

  clearRow() {
    // TODO check rows length
    // CHECKME: dispose of all elements/controls?
    this.controls.forEach(c=>c.dispose());
    this.elements.forEach(e=>{
      if ( e.material ) {
        // apparently AdvancedDynamicTexture creates and leaks material for Plane
        e.material.dispose();
      }
      e.dispose();
    });
    this.textures.forEach(t=>t.dispose());
    this.rowRoot.dispose();
    this.speechInput.dispose();
    
    this.rows.pop();

    this.rows.forEach(row=>{
      row.root.scaling.scaleInPlace(2);
      row.root.position.addInPlace(this.rowOffset.scale(-1/(this.rows.length*2)));
    });

    var row = this.rows[this.rows.length-1];
    this.rowRoot = row.root;
    this.elements = row.elements;
    this.controls = row.controls;
    this.textures = row.textures;
    this.speechInput = row.speechInput;
    this.activeControl = row.activeControl;
    this.selectCurrent();
    this.speechInput.start();
    this.rescaleHUD();
  }
  
  enableSpeech(enable) {
    if ( enable ) {
      this.speechInput.start();
    } else {
      this.speechInput.stop();
    }
  }
  
  isSelectableMesh(mesh) {
    return this.elements.includes(mesh);
  }
  
  initXR(vrHelper) {
    this.vrHelper = vrHelper;
    this.vrHelper.trackSqueeze((value,side)=>{
      let xrController = this.vrHelper.controller[side];
      let intersects = this.intersects(xrController.grip);
      console.log(side+' squeeze: '+value+"Intersects: "+intersects);
      if ( value == 1 && intersects ) {
        if ( side == 'left' ) {
          this.attachToLeftController();
        } else {
          this.attachToRightController();
        }
      } else if (this.vrHelper.squeeze.left.value == 1 && this.vrHelper.squeeze.right.value == 1) {
        this.attachToCamera();
        // TODO improve this to position/scale HUD
      }
    });
  }
  attachToLeftController() {
    this.root.parent = this.vrHelper.controller.left.grip;
    this.root.position = new BABYLON.Vector3(this.verticalWeb,0,.1);
    this.root.rotation = new BABYLON.Vector3(Math.PI/2,0,Math.PI/2);
    //this.rowOffset = new BABYLON.Vector3(-this.verticalXR,0,0);
    this.rowOffset = new BABYLON.Vector3(0,this.verticalXR,0);
    this.currentController = 'left';
  }
  attachToRightController() {
    this.root.parent = this.vrHelper.controller.right.grip;
    this.root.position = new BABYLON.Vector3(-this.verticalWeb,0,.1);
    this.root.rotation = new BABYLON.Vector3(Math.PI/2,0,-Math.PI/2);
    //this.rowOffset = new BABYLON.Vector3(this.verticalXR,0,0);
    this.rowOffset = new BABYLON.Vector3(0,this.verticalXR,0);
    this.currentController = 'right';
  }
  attachedController() {
    if (this.currentController) {
      return this.vrHelper.controller[this.currentController];
    }
    return null;
  }
  otherController() {
    if ( this.currentController && this.vrHelper ) {
      if ( 'left' == this.currentController ) {
        return this.vrHelper.controller.right;
      } else {
        return this.vrHelper.controller.left;
      }
    }
    return null;
  }
  intersects(mesh) {
    let ret = false;
    this.elements.forEach(e=>{
      if (e.getClassName() == "HolographicButton") {
        ret |= e.mesh.intersectsMesh(mesh);
      } else {
        ret |= e.intersectsMesh(mesh);
      }
    });
    return ret;
  }
}