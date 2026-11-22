"""Build a local before/after inspection gallery from actual Blender renders."""
import json
from pathlib import Path


def make_gallery(base):
    manifest=json.loads((base/'manifest.json').read_text())
    labels={'player':'NovaWing heroine','scout':'Crimson predator','swarm':'Beetle drone',
            'chaser':'Blue heavy interceptor','diver':'Amber hornet','boss':'Biomechanical leviathan'}
    sections=[]
    for model in manifest['models']:
        name=model['asset']
        figures=[]
        for filename,label in [(f'before/{name}_top.png','Before · fixed camera +Z'),
                               (f'{name}_top.png','New · fixed camera +Z'),
                               (f'{name}_perspective.png','New · perspective geometry')]:
            figures.append(f'<figure><a href="{filename}"><img loading="lazy" src="{filename}" alt="{labels[name]} — {label}"></a><figcaption>{label}</figcaption></figure>')
        if name == 'player' and (base/'previews'/'player_glance.webp').exists():
            figures.append('<figure><img src="player_glance.webp" alt="Pilot turning toward the camera"><figcaption>Pilot glance · animation detail</figcaption></figure>')
        if name == 'player' and (base/'previews'/'player_turntable.webp').exists():
            figures.append('<figure><a href="player_turntable.webp"><img loading="lazy" src="player_turntable.webp" alt="Pilot and gunmetal interceptor rotated through 360 degrees"></a><figcaption>Player model · 360° turntable</figcaption></figure>')
        sections.append(f'<section><h2>{labels[name]}</h2><p>{model["triangles"]:,} triangles · {model["exported_material_batches"]} material batches · Editable Blender source and embedded-material GLB</p><div class="views">'+''.join(figures)+'</div></section>')
    html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NovaWing 2 — fleet before and after</title>
<style>body{margin:0;padding:32px;background:#07101e;color:#e0efff;font:16px system-ui}h1{margin:0 0 10px}h2{margin:0}p{color:#a4bbd1;line-height:1.55}header{max-width:1000px;margin-bottom:30px}section{margin-bottom:30px;border-top:1px solid #29405a;padding-top:20px}.views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0;background:#101d30;padding:10px;border:1px solid #26405d;border-radius:10px}img{width:100%;height:auto}figcaption{font-size:13px;color:#b9d1e7;margin-top:7px}a{color:#73dcff}@media(max-width:800px){body{padding:16px}.views{grid-template-columns:1fr}}</style>
<header><h1>NovaWing 2 · original identity, real 3D geometry</h1><p>The left and middle images compare the actual models from the fixed +Z gameplay camera. The right image shows their depth. The new fleet follows the reference artwork for the rose-haired pilot and gunmetal interceptor, crimson and blue enemies, and the original many-eyed biomechanical boss. These are model renders; gameplay readability is checked separately in Godot.</p></header>'''+''.join(sections)+'</html>'
    (base/'previews'/'index.html').write_text(html)


if __name__=='__main__':
    make_gallery(Path(__file__).resolve().parent.parent)
