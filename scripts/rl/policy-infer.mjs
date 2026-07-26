/**
 * Pure-JS MLP inference matching rl/train_bc.py export format.
 *
 * Weight JSON shape:
 * {
 *   version, obsSize, actionSize, hidden,
 *   layers: [ { w: number[][], b: number[], act: "relu"|"tanh"|"identity" }, ... ],
 *   // final layer outputs ACTION_SIZE raw values; post: tanh on [0,1], sigmoid on [2,3]
 * }
 */

function matvec(w, b, x) {
    const out = new Float32Array(b.length);
    for (let i = 0; i < b.length; i++) {
        let s = b[i];
        const row = w[i];
        for (let j = 0; j < x.length; j++) s += row[j] * x[j];
        out[i] = s;
    }
    return out;
}

function relu(x) {
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = x[i] > 0 ? x[i] : 0;
    return out;
}

function tanhArr(x) {
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = Math.tanh(x[i]);
    return out;
}

function sigmoid(v) {
    if (v >= 0) {
        const z = Math.exp(-v);
        return 1 / (1 + z);
    }
    const z = Math.exp(v);
    return z / (1 + z);
}

/**
 * @param {object} policy exported JSON
 * @param {Float32Array|number[]} obs
 * @returns {Float32Array} length actionSize: [ax, ay, fire, boost] in model space
 */
export function forwardPolicy(policy, obs) {
    let h = obs instanceof Float32Array ? obs : Float32Array.from(obs);
    if (h.length !== policy.obsSize) {
        throw new Error(`obs size ${h.length} != policy.obsSize ${policy.obsSize}`);
    }

    const layers = policy.layers || [];
    for (let li = 0; li < layers.length; li++) {
        const layer = layers[li];
        h = matvec(layer.w, layer.b, h);
        if (layer.act === 'relu') h = relu(h);
        else if (layer.act === 'tanh') h = tanhArr(h);
        // identity: leave logits as-is
    }

    // Post-process: continuous move via tanh, buttons via sigmoid
    const out = new Float32Array(policy.actionSize || 4);
    out[0] = Math.tanh(h[0] || 0);
    out[1] = Math.tanh(h[1] || 0);
    out[2] = sigmoid(h[2] || 0);
    out[3] = sigmoid(h[3] || 0);
    return out;
}

/**
 * Install an in-page rAF pilot that runs a policy JSON.
 * Must be passed to page.evaluate as a function with policy injected.
 */
export function createInPagePolicyPilotSource() {
    // Returned as a string-free function for page.evaluate({ policy, encode, forward }).
    // Actual install is done in play-policy.mjs via page.evaluate with inlined helpers.
    return null;
}
