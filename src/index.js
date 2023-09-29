// ThreeJS and Third-party deps
import * as THREE from "three"
import * as dat from 'dat.gui'
import Stats from "three/examples/jsm/libs/stats.module"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"

// Core boilerplate code deps
import { createCamera, createRenderer, runApp, updateLoadingProgressBar } from "./core-utils"

// Other deps
import { loadTexture } from "./common-utils"
import Albedo from "./assets/Albedo.jpg"
import Bump from "./assets/Bump.jpg"
import Clouds from "./assets/Clouds.png"
// import NightLights from "./assets/night_lights_modified.png"
// import Ocean from "./assets/Ocean.png"
// import GaiaSky from "./assets/Gaia_EDR3_darkened.png"
// import vertexShader from "./shaders/vertex.glsl"
// import fragmentShader from "./shaders/fragment.glsl"

global.THREE = THREE
// previously this feature is .legacyMode = false, see https://www.donmccurdy.com/2020/06/17/color-management-in-threejs/
// turning this on has the benefit of doing certain automatic conversions (for hexadecimal and CSS colors from sRGB to linear-sRGB)
THREE.ColorManagement.enabled = true

/**************************************************
 * 0. Tweakable parameters for the scene
 *************************************************/
const params = {
  // general scene params
  sunIntensity: 1.3, // brightness of the sun
  speedFactor: 2.0, // rotation speed of the earth
  // metalness: 0.1,
  // atmOpacity: { value: 0.7 },
  // atmPowFactor: { value: 4.1 },
  // atmMultiplier: { value: 9.5 },
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
  _renderer.outputColorSpace = THREE.SRGBColorSpace
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

    // adding a virtual sun using directional light
    this.dirLight = new THREE.DirectionalLight(0xffffff, params.sunIntensity)
    this.dirLight.position.set(-50, 0, 30)
    scene.add(this.dirLight)

    // updates the progress bar to 10% on the loading UI
    await updateLoadingProgressBar(0.1)

    // loads earth's color map, the basis of how our earth looks like
    const albedoMap = await loadTexture(Albedo)
    albedoMap.colorSpace = THREE.SRGBColorSpace
    await updateLoadingProgressBar(0.2)

    const bumpMap = await loadTexture(Bump)
    await updateLoadingProgressBar(0.3)
    
    const cloudsMap = await loadTexture(Clouds)
    await updateLoadingProgressBar(0.4)

    // const lightsMap = await loadTexture(NightLights)
    // await updateLoadingProgressBar(0.5)

    // const oceanMap = await loadTexture(Ocean)
    // await updateLoadingProgressBar(0.6)

    // const envMap = await loadTexture(GaiaSky)
    // envMap.mapping = THREE.EquirectangularReflectionMapping
    // envMap.colorSpace = THREE.SRGBColorSpace
    // await updateLoadingProgressBar(0.7)
    
    // scene.background = envMap

    // create group for easier manipulation of objects(ie later with clouds and atmosphere added)
    this.group = new THREE.Group()
    // earth's axial tilt is 23.5 degrees
    this.group.rotation.z = 23.5 / 360 * 2 * Math.PI
    
    let earthGeo = new THREE.SphereGeometry(10, 64, 64)
    let earthMat = new THREE.MeshStandardMaterial({
      map: albedoMap,
      bumpMap: bumpMap,
      bumpScale: 0.03, // must be really small, if too high even bumps on the back side got lit up
      // emissiveMap: lightsMap,
      // emissive: new THREE.Color(0xffff88),
      // roughnessMap: oceanMap, // will get reversed in the shaders
      // metalness: params.metalness, // gets multiplied with the texture values from metalness map
      // metalnessMap: oceanMap,
    })
    this.earth = new THREE.Mesh(earthGeo, earthMat)
    this.group.add(this.earth)
    
    let cloudGeo = new THREE.SphereGeometry(10.05, 64, 64)
    let cloudsMat = new THREE.MeshStandardMaterial({
      alphaMap: cloudsMap,
      transparent: true,
    })
    this.clouds = new THREE.Mesh(cloudGeo, cloudsMat)
    this.group.add(this.clouds)
    
    // set initial rotational position of earth to get a good initial angle
    this.earth.rotateY(-0.3)
    // this.clouds.rotateY(-0.3)

    // let atmosGeo = new THREE.SphereGeometry(12.5, 64, 64)
    // let atmosMat = new THREE.ShaderMaterial({
    //   vertexShader: vertexShader,
    //   fragmentShader: fragmentShader,
    //   uniforms: {
    //     atmOpacity: params.atmOpacity,
    //     atmPowFactor: params.atmPowFactor,
    //     atmMultiplier: params.atmMultiplier
    //   },
    //   // notice that by default, Three.js uses NormalBlending, where if your opacity of the output color gets lower, the displayed color might get whiter
    //   blending: THREE.AdditiveBlending, // works better than setting transparent: true, because it avoids a weird dark edge around the earth
    //   side: THREE.BackSide // such that it does not overlays on top of the earth; this points the normal in opposite direction in vertex shader
    // })
    // this.atmos = new THREE.Mesh(atmosGeo, atmosMat)
    // this.group.add(this.atmos)

    scene.add(this.group)

    // meshphysical.glsl.js is the shader used by MeshStandardMaterial: https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderLib/meshphysical.glsl.js
    // shadowing of clouds, from https://discourse.threejs.org/t/how-to-cast-shadows-from-an-outer-sphere-to-an-inner-sphere/53732/6
    // some notes of the negative light map done on the earth material to simulate shadows casted by clouds
    // we need uTime so as to act as a means to calibrate the offset of the clouds shadows on earth(especially when earth and cloud rotate at different speeds)
    // the way I need to use fracts here is to get a correct calculated result of the cloud texture offset as it moves,
    // arrived at current method by doing the enumeration of cases (writing them down truly helps, don't keep everything in your head!)
    // earthMat.onBeforeCompile = function( shader ) {
    //   // console.log(shader) // for checking shaderID
    //   shader.uniforms.tClouds = { value: cloudsMap }
    //   shader.uniforms.uTime = { value: 0 }
    //   shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D tClouds;\nuniform float uTime;');
    //   shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
    //     float roughnessFactor = roughness;

    //     #ifdef USE_ROUGHNESSMAP

    //       vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
    //       // reversing the black and white values because we provide the ocean map
    //       texelRoughness = vec4(1.0) - texelRoughness;

    //       // reads channel G, compatible with a combined OcclusionRoughnessMetallic (RGB) texture
    //       roughnessFactor *= clamp(texelRoughness.g, 0.4, 1.0);

    //     #endif
    //   `);
    //   shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
    //     #ifdef USE_EMISSIVEMAP

    //       vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
    //       // show night lights where in the earth's shaded side
    //       // going through the shader calculations in the meshphysical shader chunks (mostly on the vertex side),
    //       // we can confirm that geometryNormal is basically = normalize( vNormal ); where vNormal is the vertex normals in view space,
    //       // derivation flow in the shader code is roughly:
    //       // vec3 objectNormal = vec3( normal ); - from beginnormal_vertex.glsl.js
    //       // transformedNormal = normalMatrix * objectNormal; - from defaultnormal_vertex.glsl.js
    //       // vNormal = normalize( transformedNormal ); - from normal_vertex.glsl.js
    //       emissiveColor *= 1.0 - smoothstep(-0.02, 0.0, dot(geometryNormal, directionalLights[0].direction));
    //       totalEmissiveRadiance *= emissiveColor.rgb;

    //     #endif

    //     // negative light map to simulate cloud shadows onto earth
    //     diffuseColor.rgb *= max(1.0 - texture2D(tClouds, vec2(fract(1.0 + (vMapUv.x - fract(uTime))), vMapUv.y)).r, 0.2 ); // Clamp it up so it doesn't get too dark unless you want

    //     // adding small amount of atmospheric coloring to make it more realistic
    //     // fine tune the first constant for stronger or weaker effect
    //     float intensity = 1.4 - dot( geometryNormal, vec3( 0.0, 0.0, 1.0 ) );
    //     vec3 atmosphere = vec3( 0.3, 0.6, 1.0 ) * pow(intensity, 5.0);
    //     diffuseColor.rgb += atmosphere;
    //   `)

    //   // need save to userData.shader in order for our code to update values in the shader uniforms,
    //   // reference from https://github.com/mrdoob/three.js/blob/master/examples/webgl_materials_modified.html
    //   earthMat.userData.shader = shader
    // }

    // GUI controls
    const gui = new dat.GUI()
    gui.add(params, "sunIntensity", 0.0, 5.0, 0.1).onChange((val) => {
      this.dirLight.intensity = val
    }).name("Sun Intensity")
    // gui.add(params, "metalness", 0.0, 1.0, 0.05).onChange((val) => {
    //   earthMat.metalness = val
    // }).name("Ocean Metalness")
    gui.add(params, "speedFactor", 0.1, 20.0, 0.1).name("Rotation Speed")
    // gui.add(params.atmOpacity, "value", 0.0, 1.0, 0.05).name("atmOpacity")
    // gui.add(params.atmPowFactor, "value", 0.0, 20.0, 0.1).name("atmPowFactor")
    // gui.add(params.atmMultiplier, "value", 0.0, 20.0, 0.1).name("atmMultiplier")

    // Stats - show fps
    this.stats1 = new Stats()
    this.stats1.showPanel(0) // Panel 0 = fps
    this.stats1.domElement.style.cssText = "position:absolute;top:0px;left:0px;"
    // this.container is the parent DOM element of the threejs canvas element
    this.container.appendChild(this.stats1.domElement)

    await updateLoadingProgressBar(1.0, 100)
  },
  // @param {number} interval - time elapsed between 2 frames
  // @param {number} elapsed - total time elapsed since app start
  updateScene(interval, elapsed) {
    this.controls.update()
    this.stats1.update()

    // use rotateY instead of rotation.y so as to rotate by axis Y local to each mesh
    this.earth.rotateY(interval * 0.005 * params.speedFactor)
    this.clouds.rotateY(interval * 0.01 * params.speedFactor)

    // const shader = this.earth.material.userData.shader
    // if ( shader ) {
    //   // since the clouds is twice as fast as the earth
    //   // we need to offset the movement of clouds texture on the earth by the same value of "speed" of the earth
    //   // the value here is decided by mapping the value of one rotation in radians (2PI) to one rotation in uv.u (1.0)
    //   // the length covered by texture.u in terms of uv(0..1) for a certain value of radians rotated is calculated as follows:
    //   // (rotated_radians / 2PI) * 1.0
    //   shader.uniforms.uTime.value += (interval * 0.005 * params.speedFactor) / (2 * Math.PI)
    // }
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
