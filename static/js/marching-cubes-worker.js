const SIMPLEX_IMPL = `
    const F3 = 1.0 / 3.0;
    const G3 = 1.0 / 6.0;
    
    const grad3 = [
        [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
        [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
        [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
    ];
    
    const perm = new Uint8Array(512);
    const gradP = new Array(12);
    
    function seed(s) {
        if (s > 0 && s < 1) s *= 65536;
        s = Math.floor(s);
        if (s < 256) s |= s << 8;
        for (let i = 0; i < 256; i++) {
            let v = (i & 1) ? ((s >> 8) ^ (s & 255)) : (s ^ (s >> 8));
            v ^= i;
            v = (v * 1103515245 + 12345) & 255;
            perm[i] = perm[i + 256] = v;
        }
        for (let i = 0; i < 12; i++) gradP[i] = grad3[i];
    }
    
    function dot3(g, x, y, z) { return g[0]*x + g[1]*y + g[2]*z; }
    
    function noise3D(x, y, z) {
        let n0, n1, n2, n3;
        const s = (x + y + z) * F3;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const k = Math.floor(z + s);
        const t = (i + j + k) * G3;
        const X0 = i - t;
        const Y0 = j - t;
        const Z0 = k - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        const z0 = z - Z0;
        let i1, j1, k1, i2, j2, k2;
        if (x0 >= y0) {
            if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
            else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
            else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
        } else {
            if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
            else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
            else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
        }
        const x1 = x0 - i1 + G3;
        const y1 = y0 - j1 + G3;
        const z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2.0 * G3;
        const y2 = y0 - j2 + 2.0 * G3;
        const z2 = z0 - k2 + 2.0 * G3;
        const x3 = x0 - 1.0 + 3.0 * G3;
        const y3 = y0 - 1.0 + 3.0 * G3;
        const z3 = z0 - 1.0 + 3.0 * G3;
        const ii = i & 255;
        const jj = j & 255;
        const kk = k & 255;
        const gi0 = perm[ii + perm[jj + perm[kk]]] % 12;
        const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
        const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
        const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12;
        let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
        n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * dot3(gradP[gi0], x0, y0, z0));
        let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
        n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * dot3(gradP[gi1], x1, y1, z1));
        let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
        n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * dot3(gradP[gi2], x2, y2, z2));
        let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
        n3 = t3 < 0 ? 0 : (t3 *= t3, t3 * t3 * dot3(gradP[gi3], x3, y3, z3));
        return 32.0 * (n0 + n1 + n2 + n3);
    }
    
    function fbmSimplex(x, y, z, octaves) {
        let v = 0;
        let a = 0.5;
        let f = 1.0;
        for (let i = 0; i < octaves; i++) {
            v += a * noise3D(x * f, y * f, z * f);
            a *= 0.5;
            f *= 2.0;
        }
        return v;
    }
    
    function ferroSpikes(x, y, z, freq) {
        const px = Math.abs(Math.sin(x * freq * Math.PI));
        const py = Math.abs(Math.sin(y * freq * Math.PI));
        const pz = Math.abs(Math.sin(z * freq * Math.PI));
        const ridge = px * py + py * pz + px * pz;
        return Math.max(0, 1 - Math.pow(ridge, 2.5));
    }
`;

self.onmessage = function(e) {
    const { resolution, numInstances, params } = e.data;
    const totalSize = resolution * resolution * resolution;
    
    self.postMessage({ type: 'progress', progress: 0, message: 'Initializing...' });
    
    eval(SIMPLEX_IMPL);
    seed(42);
    
    const fields = [];
    
    for (let idx = 0; idx < numInstances; idx++) {
        self.postMessage({ type: 'progress', progress: idx / numInstances, message: `Calculating instance ${idx + 1}/${numInstances}...` });
        
        const field = new Float32Array(totalSize);
        const noiseOffset = idx * 17.3;
        const spikeFreq = params.spikeFreq * 3;
        const spikeScale = params.spikeScale * 0.08;
        const macroScale = params.macroScale;
        
        let cellIndex = 0;
        const batchSize = 1000;
        
        for (let k = 0; k < resolution; k++) {
            const nz = (k / resolution) - 0.5;
            
            for (let j = 0; j < resolution; j++) {
                const ny = (j / resolution) - 0.5;
                
                if (cellIndex % batchSize === 0) {
                    self.postMessage({ type: 'progress', progress: (idx + cellIndex / totalSize) / numInstances, message: `Instance ${idx + 1}: ${Math.floor(cellIndex / totalSize * 100)}%` });
                }
                
                for (let i = 0; i < resolution; i++) {
                    const nx = (i / resolution) - 0.5;
                    
                    const macroFbm = fbmSimplex(
                        nx * macroScale + noiseOffset,
                        ny * macroScale + noiseOffset * 0.7,
                        nz * macroScale + noiseOffset * 0.5,
                        2
                    );
                    
                    const spike = ferroSpikes(nx, ny, nz, spikeFreq);
                    
                    const macro = 0.5 + macroFbm * 0.3;
                    const combined = macro * spike * spikeScale;
                    
                    field[cellIndex++] = combined;
                }
            }
        }
        
        fields.push(Array.from(field));
    }
    
    self.postMessage({ type: 'complete', fields: fields }, [fields.map(f => new Float32Array(f).buffer)]);
};
