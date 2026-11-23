"""Paint and unwrap the fleet's scavenged armor in its common authoring frame."""
import bpy
import numpy as np

# Enamel, racing stripe, and hand-painted crew mark in sRGB.
LIVERIES = {
    "player": ("515b70", "87919e", "ba773c"),
    "scout": ("ab3242", "ff9b22", "201923"),
    "swarm": ("562174", "c8e63d", "ee4094"),
    "chaser": ("234fa6", "15d9c7", "ffbf36"),
    "diver": ("ce671e", "242431", "e7fa54"),
    "boss": ("872446", "d0b597", "13ccb5"),
}


def rgb(code):
    return np.array(list(bytes.fromhex(code))) / 255


def packed_image(name, pixels, linear=False):
    height, width = pixels.shape[:2]
    image = bpy.data.images.new(name, width, height, alpha=False)
    if linear:
        image.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :3] = pixels
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    return image


def paint(kind, material):
    # One coherent livery spans the individual plates of each ship.
    size = 1024
    rng = np.random.default_rng(120 + list(LIVERIES).index(kind))
    y, x = np.mgrid[0:size, 0:size] / size
    enamel, stripe, tag = map(rgb, LIVERIES[kind])
    color = np.broadcast_to(enamel, (size, size, 3)).copy()
    # Dorsal UVs follow flight direction (+u) with the spine at v=.5.
    flank = abs(y-.5)
    if kind == 'player':
        lane = (x + .47*y) % .54
        color[(lane < .010) & (flank > .11)] = stripe
        color[(lane > .032) & (lane < .055) & (flank > .15)] = tag
    elif kind == 'chaser':
        lane = abs(flank - .17 + .22*(x-.4))
        color[(lane < .022) | ((lane > .032) & (lane < .038))] = stripe
        color[(x > .48) & (x < .51) & (flank > .18)] = tag
    elif kind == 'scout':
        rake = (x - .72*flank) % .26
        color[(rake < .08 - .20*flank) & (flank > .09)] = tag
        color[(rake < .014) & (flank > .14)] = stripe
    elif kind == 'diver':
        band = (x - .32*flank) % .17
        color[(band < .035) & (flank > .10)] = stripe
        color[(band > .042) & (band < .05) & (flank > .14)] = tag
    elif kind == 'swarm':
        arc = flank + 1.2*(x-.42)**2
        color[(arc > .14) & (arc < .165)] = tag
        color[(arc > .172) & (arc < .182)] = stripe
    else:
        rib = (x - .15*np.cos(10*flank)) % .19
        color[rib < .022 + .055*flank] = enamel*.52
        color[(rib < .009) & (flank > .15)] = stripe
    panel = (y + np.floor(x*4)*.036) % .21
    seam = (panel < .004) | ((x % .25 < .003) & (panel < .17))
    color[seam] = rgb("292732")
    flecks = rng.random(x.shape)
    worn = (flecks < .003) | ((panel < .012) & (flecks < .36))
    for _ in range(190):
        sx, sy = rng.random(2)
        length = rng.uniform(.008, .07)
        slope = rng.uniform(-.7, .4)
        worn |= (x > sx) & (x < sx+length) & (abs(y-sy-(x-sx)*slope) < .0008)
    color[worn] = rgb("939294")
    grain = rng.normal(0, .012, x.shape) + .025*np.sin(80*x+7*np.sin(29*y))
    color = np.clip(color + grain[:, :, None], 0, 1)
    roughness = np.clip(np.where(worn, .36, .61) + grain*1.5 + seam*.23, 0, 1)
    shader = material.node_tree.nodes.get('Principled BSDF')
    for name, data, socket in [('Livery', color, 'Base Color'),
                                ('Wear', roughness[:, :, None], 'Roughness')]:
        node = material.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = packed_image(kind+'_'+name, data, socket == 'Roughness')
        material.node_tree.links.new(node.outputs['Color'], shader.inputs[socket])


def unwrap(obj, span):
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new()
    matrix = obj.matrix_world
    normal_matrix = matrix.to_3x3().inverted_safe().transposed()
    for face in obj.data.polygons:
        normal = normal_matrix @ face.normal
        axis = max(range(3), key=lambda i: abs(normal[i]))
        u, v = [(1, 2), (0, 2), (0, 1)][axis]
        for index in face.loop_indices:
            point = matrix @ obj.data.vertices[obj.data.loops[index].vertex_index].co
            uv.data[index].uv = (.5 + point[u]/span, .5 + point[v]/span)
