"""Read-only PPTX object inventory for component-library research.

No Office application, embedded code or external relationships are executed.
Positions remain raw DrawingML coordinates; group transforms are preserved,
not silently flattened into purported absolute geometry.
"""
import argparse
import collections
import hashlib
import json
import posixpath
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
TYPES = {"sp": "shape", "grpSp": "group", "cxnSp": "connector", "pic": "image", "graphicFrame": "frame"}


def inspect(source: Path):
    slides, totals, geometry, bindings = [], collections.Counter(), collections.Counter(), collections.Counter()
    with zipfile.ZipFile(source) as archive:
        def xml(name):
            info = archive.getinfo(name)
            if info.file_size > 10_000_000:
                raise ValueError("XML part exceeds the 10 MB inspection limit")
            return ET.fromstring(archive.read(name))

        pres = xml("ppt/presentation.xml")
        rels = {r.get("Id"): r.get("Target") for r in xml("ppt/_rels/presentation.xml.rels") if r.get("TargetMode") != "External"}
        slide_size = pres.find("p:sldSz", NS).attrib
        for number, slide_id in enumerate(pres.find("p:sldIdLst", NS), 1):
            target = rels[slide_id.get("{" + NS["r"] + "}id")]
            part = posixpath.normpath(posixpath.join("ppt", target))
            if not part.startswith("ppt/slides/"):
                raise ValueError("Unexpected slide relationship")
            root, objects = xml(part), []

            def walk(parent, parent_id=None, variants=()):
                for element in parent:
                    tag = element.tag.rsplit("}", 1)[-1]
                    if tag not in TYPES:
                        if tag in {"AlternateContent", "Choice", "Fallback"}:
                            walk(element, parent_id, variants + (tag,))
                        continue
                    props = next(iter(element), None)
                    nv = props.find("p:cNvPr", NS) if props is not None else None
                    if nv is None:
                        continue
                    object_id = nv.get("id")
                    geom = element.find("p:spPr/a:prstGeom", NS)
                    transform = element.find("p:grpSpPr/a:xfrm" if tag == "grpSp" else "p:spPr/a:xfrm", NS)
                    # Extract only text runs, excluding paragraph-property XML.
                    text = "\n".join("".join(t.text or "" for t in p.findall(".//a:t", NS)) for p in element.findall("p:txBody/a:p", NS))
                    obj = {"id": object_id, "name": nv.get("name"), "type": TYPES[tag], "parent_id": parent_id, "alternate_representation": list(variants),
                           "geometry": geom.get("prst") if geom is not None else None, "text": text,
                           "transform": {"attributes": dict(transform.attrib), "children": {n.tag.rsplit("}", 1)[-1]: dict(n.attrib) for n in transform}} if transform is not None else None}
                    if tag == "cxnSp":
                        start, end = element.find(".//a:stCxn", NS), element.find(".//a:endCxn", NS)
                        obj["connections"] = {"start": dict(start.attrib) if start is not None else None, "end": dict(end.attrib) if end is not None else None}
                        bindings["both" if start is not None and end is not None else "one" if start is not None or end is not None else "none"] += 1
                    objects.append(obj)
                    totals[TYPES[tag]] += 1
                    if obj["geometry"]:
                        geometry[obj["geometry"]] += 1
                    if tag == "grpSp":
                        walk(element, object_id, variants)

            walk(root.find("p:cSld/p:spTree", NS))
            ids = {o["id"] for o in objects}
            for obj in objects:
                c = obj.get("connections")
                if c and c["start"] and c["end"] and c["start"]["id"] in ids and c["end"]["id"] in ids:
                    bindings["both_resolved"] += 1
            slides.append({"number": number, "part": part, "object_count": len(objects), "objects": objects})
    return {
        "source": str(source.resolve()), "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "slide_count": len(slides), "slide_size_emu": dict(slide_size), "object_counts": dict(totals),
        "preset_geometry_counts": dict(geometry.most_common()), "connector_bindings": dict(bindings),
        "coordinate_policy": "Raw DrawingML transforms; parent references retained. AlternateContent branches are counted separately, not as simultaneous visible shapes. No absolute-coordinate or semantic reconstruction claim.",
        "slides": slides,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = inspect(args.source)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: value for key, value in result.items() if key != "slides"}, ensure_ascii=False, indent=2))
