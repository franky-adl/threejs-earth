varying vec3 v_pos;
varying vec3 vNormal;
void main() {
    v_pos = position;
    // normalMatrix is a matrix that is used to transform normals from object space to world space.
    // result is that vNormal is consistent per fragment no matter how we rotate the scene
    vNormal = normalize( normalMatrix * normal );
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}