const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;
const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
const perm = new Uint8Array(512);
const gradP = new Array(12);

function seed(s) { if (s > 0 && s < 1) s *= 65536; s = Math.floor(s); if (s < 256) s |= s << 8; for (let i = 0; i < 256; i++) { let v = (i & 1) ? ((s >> 8) ^ (s & 255)) : (s ^ (s >> 8)); v ^= i; v = (v * 1103515245 + 12345) & 255; perm[i] = perm[i + 256] = v; } for (let i = 0; i < 12; i++) gradP[i] = grad3[i]; }
function dot3(g, x, y, z) { return g[0]*x + g[1]*y + g[2]*z; }
function noise3D(x, y, z) {
    let n0, n1, n2, n3;
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const X0 = i - t, Y0 = j - t, Z0 = k - t;
    const x0 = x - X0, y0 = y - Y0, z0 = z - Z0;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) { if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; } else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; } else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; } } else { if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; } else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; } else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; } }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2.0 * G3, y2 = y0 - j2 + 2.0 * G3, z2 = z0 - k2 + 2.0 * G3;
    const x3 = x0 - 1.0 + 3.0 * G3, y3 = y0 - 1.0 + 3.0 * G3, z3 = z0 - 1.0 + 3.0 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const gi0 = perm[ii + perm[jj + perm[kk]]] % 12;
    const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
    const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
    const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12;
    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0; n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * dot3(gradP[gi0], x0, y0, z0));
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1; n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * dot3(gradP[gi1], x1, y1, z1));
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2; n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * dot3(gradP[gi2], x2, y2, z2));
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3; n3 = t3 < 0 ? 0 : (t3 *= t3, t3 * t3 * dot3(gradP[gi3], x3, y3, z3));
    return 32.0 * (n0 + n1 + n2 + n3);
}
function fbmSimplex(x, y, z, octaves) { let v = 0, a = 0.5, f = 1.0; for (let i = 0; i < octaves; i++) { v += a * noise3D(x * f, y * f, z * f); a *= 0.5; f *= 2.0; } return v; }

seed(42);

self.onmessage = function(e) {
    const { resolution, params } = e.data;
    const totalSize = resolution * resolution * resolution;
    self.postMessage({ type: 'progress', progress: 0, message: 'Initializing...' });
    const field = new Float32Array(totalSize);
    const macroScale = params.macroScale || 1.0;
    const distOffset = params.distOffset || 1.0;
    const distAtten = params.distAtten || 0.2;
    let cellIndex = 0;
    for (let k = 0; k < resolution; k++) {
        const nz = (k / resolution) - 0.5;
        for (let j = 0; j < resolution; j++) {
            const ny = (j / resolution) - 0.5;
            if (cellIndex % 5000 === 0) {
                self.postMessage({ type: 'progress', progress: cellIndex / totalSize, message: `Computing: ${Math.floor(cellIndex / totalSize * 100)}%` });
            }
            for (let i = 0; i < resolution; i++) {
                const nx = (i / resolution) - 0.5;
                const macroFbm = fbmSimplex(nx * macroScale, ny * macroScale, nz * macroScale, 2);
                let baseDensity = -(macroFbm - 0.55);
                const distToCenter = Math.sqrt(nx*nx + ny*ny + nz*nz);
                let finalDensity = baseDensity + (distToCenter * distAtten) - distOffset;
                field[cellIndex++] = Math.max(-1, Math.min(1, finalDensity));
            }
        }
    }
    self.postMessage({ type: 'complete', field: field }, [field.buffer]);
};
