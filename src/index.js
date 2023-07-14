// ThreeJS and Third-party deps
import * as THREE from "three"
import * as dat from 'dat.gui'
import Stats from "three/examples/jsm/libs/stats.module"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"

// Core boilerplate code deps
import { createCamera, createRenderer, runApp } from "./core-utils"

// Other deps
import Albedo from "./assets/Albedo.jpg"
import Clouds from "./assets/Clouds.png"
import Bump from "./assets/Bump.jpg"
import NightLights from "./assets/night_lights_modified.png"

global.THREE = THREE
// previously this feature is .legacyMode = false, see https://www.donmccurdy.com/2020/06/17/color-management-in-threejs/
// turning this on has the benefit of doing certain automatic conversions (for hexadecimal and CSS colors from sRGB to linear-sRGB)
THREE.ColorManagement.enabled = true

/**************************************************
 * 0. Tweakable parameters for the scene
 *************************************************/
const params = {
  // general scene params
}


/**************************************************
 * 1. Initialize core threejs components
 *************************************************/
// Create the scene
let scene = new THREE.Scene()

// Create the renderer via 'createRenderer',
// 1st param receives additional WebGLRenderer properties
// 2nd param receives a custom callback to further configure the renderer
let renderer = createRenderer({ antialias: true }, (_renderer) => {
  // best practice: ensure output colorspace is in sRGB, see Color Management documentation:
  // https://threejs.org/docs/#manual/en/introduction/Color-management
  _renderer.outputEncoding = THREE.sRGBEncoding
})

// Create the camera
// Pass in fov, near, far and camera position respectively
let camera = createCamera(45, 1, 1000, { x: 0, y: 0, z: 30 })


/**************************************************
 * 2. Build your scene in this threejs app
 * This app object needs to consist of at least the async initScene() function (it is async so the animate function can wait for initScene() to finish before being called)
 * initScene() is called after a basic threejs environment has been set up, you can add objects/lighting to you scene in initScene()
 * if your app needs to animate things(i.e. not static), include a updateScene(interval, elapsed) function in the app as well
 *************************************************/
let app = {
  async initScene() {
    // OrbitControls
    this.controls = new OrbitControls(camera, renderer.domElement)
    this.controls.enableDamping = true

    this.dirLight = new THREE.DirectionalLight()
    this.dirLight.position.set(-50, 50, 0)
    scene.add(this.dirLight)

    const albedoMap = await this.loadTexture(Albedo)
    const cloudsMap = await this.loadTexture(Clouds)
    const bumpMap = await this.loadTexture(Bump)
    const lightsMap = await this.loadTexture(NightLights)
    
    let earthGeo = new THREE.SphereGeometry(10, 64, 64)
    let earthMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      emissiveMap: lightsMap,
      emissive: new THREE.Color(0xffff88),
      bumpMap: bumpMap,
      bumpScale: 0.03, // must be really small, if too high even bumps on the back side got lit up
    })
    this.earth = new THREE.Mesh(earthGeo, earthMat)
    scene.add(this.earth)

    let cloudGeo = new THREE.SphereGeometry(10.05, 64, 64)
    let cloudsMat = new THREE.MeshStandardMaterial({
      map: cloudsMap,
      alphaMap: cloudsMap,
      transparent: true,
    })
    this.clouds = new THREE.Mesh(cloudGeo, cloudsMat)
    scene.add(this.clouds)

    // meshphysical.glsl.js is the shader used by MeshStandardMaterial: https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderLib/meshphysical.glsl.js
    // shadowing of clouds, from https://discourse.threejs.org/t/how-to-cast-shadows-from-an-outer-sphere-to-an-inner-sphere/53732/6
    // some notes of the negative light map done on the earth material to simulate shadows casted by clouds
    // we need uTime so as to act as a means to calibrate the offset of the clouds shadows on earth(especially when earth and cloud rotate at different speeds)
    // the way I need to use fracts here is to get a correct calculated result of the cloud texture offset as it moves,
    // arrived at current method by doing the enumeration of cases (writing them down truly helps, don't keep everything in your head!)
    earthMat.onBeforeCompile = function( shader ) {
      // console.log(shader) // for checking shaderID
      shader.uniforms.tClouds = { value: cloudsMap }
      shader.uniforms.uTime = { value: 0 }
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D tClouds;\nuniform float uTime;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
        #ifdef USE_EMISSIVEMAP

          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          // show night lights where in the earth's shaded side
          emissiveColor *= 1.0 - smoothstep(-0.02, 0.0, dot(geometryNormal, directionalLights[0].direction));
          totalEmissiveRadiance *= emissiveColor.rgb;

        #endif

        // negative light map to simulate cloud shadows onto earth
        diffuseColor.rgb *= max(1.0 - texture2D(tClouds, vec2(fract(1.0 + (vMapUv.x - fract(uTime))), vMapUv.y)).r, 0.2 ); // Clamp it up so it doesn't get too dark unless you want
      `)

      // need save to userData.shader in order for our code to update values in the shader uniforms,
      // reference from https://github.com/mrdoob/three.js/blob/master/examples/webgl_materials_modified.html
      earthMat.userData.shader = shader
    }

    // GUI controls
    const gui = new dat.GUI()

    // Stats - show fps
    this.stats1 = new Stats()
    this.stats1.showPanel(0) // Panel 0 = fps
    this.stats1.domElement.style.cssText = "position:absolute;top:0px;left:0px;"
    // this.container is the parent DOM element of the threejs canvas element
    this.container.appendChild(this.stats1.domElement)
  },
  async loadTexture(url) {
    this.textureLoader = this.textureLoader || new THREE.TextureLoader()
    return new Promise(resolve => {
      this.textureLoader.load(url, texture => {
        resolve(texture)
      })
    })
  },
  // @param {number} interval - time elapsed between 2 frames
  // @param {number} elapsed - total time elapsed since app start
  updateScene(interval, elapsed) {
    this.controls.update()
    this.stats1.update()

    this.earth.rotation.y += interval * 0.005
    this.clouds.rotation.y += interval * 0.01

    const shader = this.earth.material.userData.shader
    if ( shader ) {
      // since the clouds is twice as fast as the earth
      // we need to offset the movement of clouds texture on the earth by the same value of "speed" of the earth
      // the value here is decided by mapping the value of one rotation in radians (2PI) to one rotation in uv.u (1.0)
      // the length covered by texture.u in terms of uv(0..1) for a certain value of radians rotated is calculated as follows:
      // (rotated_radians / 2PI) * 1.0
      shader.uniforms.uTime.value += (interval * 0.005) / (2 * Math.PI)
    }
  }
}

/**************************************************
 * 3. Run the app
 * 'runApp' will do most of the boilerplate setup code for you:
 * e.g. HTML container, window resize listener, mouse move/touch listener for shader uniforms, THREE.Clock() for animation
 * Executing this line puts everything together and runs the app
 * ps. if you don't use custom shaders, pass undefined to the 'uniforms'(2nd-last) param
 * ps. if you don't use post-processing, pass undefined to the 'composer'(last) param
 *************************************************/
runApp(app, scene, renderer, camera, true, undefined, undefined)
