#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tldr 图生成器：根据 spec 生成合法的 tldraw v2 .tldr 文件
用法: python tldr-gen.py <out.tldr> <spec.json>
spec.json 结构:
{
  "nodes": [ {"id","x","y","w","h","text","color","geo","fill","font","size"} ],
  "arrows":[ {"id","x1","y1","x2","y2","color","arrowheadEnd"} ],
  "texts": [ {"id","x","y","text","color","size","font"} ]
}
生成后用 tldraw-cli 导出: tldraw export out.tldr -f png -o <dir> --scale 2
"""
import json, sys, uuid

TEMPLATE = r'''{"schema": {"schemaVersion": 2, "sequences": {"com.tldraw.store": 4, "com.tldraw.asset": 1, "com.tldraw.camera": 1, "com.tldraw.document": 2, "com.tldraw.instance": 24, "com.tldraw.instance_page_state": 5, "com.tldraw.page": 1, "com.tldraw.instance_presence": 5, "com.tldraw.pointer": 1, "com.tldraw.shape": 4, "com.tldraw.asset.bookmark": 1, "com.tldraw.asset.image": 3, "com.tldraw.asset.video": 3, "com.tldraw.shape.group": 0, "com.tldraw.shape.text": 2, "com.tldraw.shape.bookmark": 2, "com.tldraw.shape.draw": 1, "com.tldraw.shape.geo": 8, "com.tldraw.shape.note": 6, "com.tldraw.shape.line": 4, "com.tldraw.shape.frame": 0, "com.tldraw.shape.arrow": 3, "com.tldraw.shape.highlight": 0, "com.tldraw.shape.embed": 4, "com.tldraw.shape.image": 3, "com.tldraw.shape.video": 2}}, "boiler": [{"gridSize": 10, "name": "", "meta": {}, "id": "document:document", "typeName": "document"}, {"id": "pointer:pointer", "typeName": "pointer", "x": 289.21484375, "y": 80, "lastActivityTimestamp": 1715095759834, "meta": {}}, {"meta": {}, "id": "page:page", "name": "Page 1", "index": "a1", "typeName": "page"}, {"followingUserId": null, "opacityForNextShape": 1, "stylesForNextShape": {}, "brush": null, "scribbles": [], "cursor": {"type": "default", "rotation": 0}, "isFocusMode": false, "exportBackground": true, "isDebugMode": false, "isToolLocked": false, "screenBounds": {"x": 0, "y": 0, "w": 1280, "h": 1328}, "insets": [false, false, false, false], "zoomBrush": null, "isGridMode": false, "isPenMode": false, "chatMessage": "", "isChatting": false, "highlightedUserIds": [], "canMoveCamera": true, "isFocused": true, "devicePixelRatio": 2, "isCoarsePointer": false, "isHoveringCanvas": false, "openMenus": ["main menu", "main-menu-sub.file"], "isChangingStyle": false, "isReadonly": false, "meta": {}, "duplicateProps": null, "id": "instance:instance", "currentPageId": "page:page", "typeName": "instance"}, {"editingShapeId": null, "croppingShapeId": null, "selectedShapeIds": [], "hoveredShapeId": null, "erasingShapeIds": [], "hintingShapeIds": [], "focusedGroupId": null, "meta": {}, "id": "instance_page_state:page:page", "pageId": "page:page", "typeName": "instance_page_state"}, {"x": 0, "y": 0, "z": 1, "meta": {}, "id": "camera:page:page", "typeName": "camera"}]}'''

def sid():
    return 'shape:' + uuid.uuid4().hex[:20]

def build(records, spec):
    page_id = 'page:page'
    shapes = []
    idx = 'a1'
    def nidx():
        nonlocal idx
        # tldraw index: base-62 风格（a1..a9, aA..aZ, b0..），字典序排序
        ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
        c1, c2 = idx[0], idx[1]
        i = ALPH.index(c2) + 1
        if i >= len(ALPH):
            c1 = ALPH[ALPH.index(c1) + 1]
            i = 0
        idx = c1 + ALPH[i]
        return idx
    # 节点
    for n in spec.get('nodes', []):
        shapes.append({
            'id': sid(), 'typeName': 'shape', 'x': n['x'], 'y': n['y'],
            'rotation': 0, 'isLocked': False, 'opacity': 1,
            'parentId': page_id, 'index': nidx(), 'meta': {}, 'type': 'geo',
            'props': {
                'geo': n.get('geo', 'rectangle'), 'labelColor': 'black',
                'color': n.get('color', 'light-blue'),
                'fill': n.get('fill', 'solid'), 'dash': n.get('dash', 'draw'),
                'size': n.get('size', 'm'), 'font': n.get('font', 'sans'),
                'text': n.get('text', ''), 'align': 'middle',
                'verticalAlign': 'middle', 'growY': 0, 'url': '', 'scale': 1,
                'w': n['w'], 'h': n['h'],
            },
        })
    # 文字（无边框）
    for t in spec.get('texts', []):
        shapes.append({
            'id': sid(), 'typeName': 'shape', 'x': t['x'], 'y': t['y'],
            'rotation': 0, 'isLocked': False, 'opacity': 1,
            'parentId': page_id, 'index': nidx(), 'meta': {}, 'type': 'text',
            'props': {
                'color': t.get('color', 'black'), 'size': t.get('size', 'm'),
                'w': t.get('w', 400), 'font': t.get('font', 'sans'),
                'textAlign': t.get('align', 'start'), 'autoSize': True, 'scale': 1,
                'text': t.get('text', ''),
            },
        })
    # 箭头
    for a in spec.get('arrows', []):
        shapes.append({
            'id': sid(), 'typeName': 'shape',
            'x': min(a['x1'], a['x2']), 'y': min(a['y1'], a['y2']),
            'rotation': 0, 'isLocked': False, 'opacity': 1,
            'parentId': page_id, 'index': nidx(), 'meta': {}, 'type': 'arrow',
            'props': {
                'color': a.get('color', 'black'), 'labelColor': 'black',
                'dash': a.get('dash', 'draw'), 'size': a.get('size', 'm'),
                'arrowheadStart': a.get('arrowheadStart', 'none'),
                'arrowheadEnd': a.get('arrowheadEnd', 'arrow'),
                'start': {'type': 'point', 'x': a['x1'] - min(a['x1'], a['x2']), 'y': a['y1'] - min(a['y1'], a['y2'])},
                'end': {'type': 'point', 'x': a['x2'] - min(a['x1'], a['x2']), 'y': a['y2'] - min(a['y1'], a['y2'])},
                'bend': a.get('bend', 0), 'font': 'sans', 'fill': 'none',
                'text': a.get('text', ''),
                'labelPosition': 0.5,
            },
        })
    records.extend(shapes)
    return records

def main():
    if len(sys.argv) < 3:
        print('用法: python tldr-gen.py <out.tldr> <spec.json>')
        sys.exit(1)
    out, spec_path = sys.argv[1], sys.argv[2]
    spec = json.load(open(spec_path, encoding='utf-8'))
    t = json.loads(TEMPLATE)
    records = [dict(r) for r in t['boiler']]
    records = build(records, spec)
    tldr = {
        'tldrawFileFormatVersion': 1,
        'schema': t['schema'],
        'records': records,
    }
    json.dump(tldr, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print('written', out)

if __name__ == '__main__':
    main()
