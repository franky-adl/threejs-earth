// reference from https://github.com/dataarts/webgl-globe/blob/8d746a3dbf95e57ec3c6c2c6effe920c95135253/globe/globe.js
varying vec3 vNormal;
void main() {
    // the dot product would decrease from 0 to negative one
    // thus making the base gradually larger towards the sphere center
    // the larger the power the quicker the change
    // if we don't switch to backside and use the default frontside instead
    // the dot product would increase from 0 to positive one
    // and thus making the base even smaller as it goes towards the sphere center
    float dotP = dot( vNormal, vec3( 0, 0, 1.0 ) );
    float intensity = pow( 0.8 - dotP, 4.5 );
    // also add change in dotP to the color to make it brighter and less blue towards the center
    gl_FragColor = vec4( 0.4 - dotP/2.0, 0.4 - dotP/2.0, 1.0, 0.65 ) * intensity;

    // (optional) colorSpace conversion for output
    // gl_FragColor = linearToOutputTexel( gl_FragColor );
}