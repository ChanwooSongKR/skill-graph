from __future__ import annotations

import io
import json
import math
import sys
import zlib
from collections import Counter, defaultdict
from datetime import datetime, UTC
from pathlib import Path
from typing import Iterator

try:
    from pgdumplib import constants, dump
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Missing dependency: pgdumplib. Install with `python3 -m pip install pgdumplib`."
    ) from exc


WISDOM_COLUMNS = [
    "id",
    "p_id",
    "c_id",
    "r_id",
    "method",
    "stage",
    "references",
    "cp_S",
    "cp_N",
    "pr_S",
    "pr_N",
    "evidence_count",
    "embedding",
    "created_at",
]

EDGE_COLUMNS = [
    "id",
    "from_wisdom_id",
    "to_wisdom_id",
    "edge_type",
    "S",
    "N",
    "source",
    "reason",
    "created_at",
]


def parse_copy_row(line: str) -> list[str | None]:
    return [None if value == r"\N" else value for value in line.rstrip("\n").split("\t")]


def _load_dump_table_of_contents(path: Path) -> dump.Dump:
    archive = dump.Dump()
    archive.entries = []
    archive._handle = path.open("rb")
    archive._read_header()

    if archive.version >= (1, 15, 0):
        archive.compression_algorithm = constants.COMPRESSION_ALGORITHMS[
            archive._compression_algorithm
        ]
    else:
        archive.compression_algorithm = (
            constants.COMPRESSION_GZIP
            if archive._read_int() != 0
            else constants.COMPRESSION_NONE
        )

    archive.timestamp = archive._read_timestamp()
    archive.dbname = archive._read_bytes().decode(archive.encoding)
    archive.server_version = archive._read_bytes().decode(archive.encoding)
    archive.dump_version = archive._read_bytes().decode(archive.encoding)
    archive._read_entries()
    return archive


def iter_table_payloads(path: str | Path) -> Iterator[tuple[str, bytes]]:
    archive = _load_dump_table_of_contents(Path(path))
    entries_by_id = {entry.dump_id: entry for entry in archive.entries}

    while True:
        block_type = archive._handle.read(1)
        if not block_type:
            break

        dump_id = archive._read_int()
        inflater = zlib.decompressobj()
        buffer = io.BytesIO()

        while True:
            chunk_size = archive._read_int()
            if chunk_size == 0:
                break
            chunk = archive._handle.read(chunk_size)
            buffer.write(inflater.decompress(chunk))

        entry = entries_by_id.get(dump_id)
        if not entry or entry.desc != "TABLE DATA":
            continue
        yield entry.tag, buffer.getvalue()


def _table_rows(raw_bytes: bytes, columns: list[str]) -> Iterator[dict[str, str | None]]:
    for line in raw_bytes.decode("utf-8", errors="replace").splitlines():
        if not line or line == r"\.":
            continue
        values = parse_copy_row(line)
        if len(values) < len(columns):
            continue
        yield dict(zip(columns, values[: len(columns)]))


def _safe_float(value: str | None, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _safe_int(value: str | None, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _hash_unit(text: str, salt: str = "") -> float:
    seed = 2166136261
    for char in f"{salt}:{text}":
        seed ^= ord(char)
        seed = (seed * 16777619) & 0xFFFFFFFF
    return seed / 0xFFFFFFFF


def _summarize_label(method: str | None, max_length: int = 88) -> str:
    if not method:
        return "Untitled wisdom"
    clean = " ".join(method.split())
    if len(clean) <= max_length:
        return clean
    return clean[: max_length - 1].rstrip() + "…"


def _score_wisdom(row: dict[str, str | None]) -> float:
    values = [
        _safe_float(row.get("cp_S")),
        _safe_float(row.get("cp_N")),
        _safe_float(row.get("pr_S")),
        _safe_float(row.get("pr_N")),
    ]
    return round(sum(values) / len(values), 4)


def _polar(angle: float, radius: float) -> tuple[float, float]:
    return math.cos(angle) * radius, math.sin(angle) * radius


def _build_layouts(nodes: list[dict], groups: list[str]) -> dict[str, list[list[float]]]:
    top_groups = [name for name, _ in Counter(groups).most_common(18)]
    cluster_keys = top_groups + ["other"]
    cluster_lookup = {name: idx for idx, name in enumerate(cluster_keys)}
    layouts: dict[str, list[list[float]]] = {
        "field": [],
        "cluster-flow": [],
    }

    ordered = sorted(range(len(nodes)), key=lambda idx: (-nodes[idx]["degree"], nodes[idx]["id"]))
    rank_lookup = {node_idx: rank for rank, node_idx in enumerate(ordered)}
    total = max(1, len(nodes) - 1)

    anchor_angles = [0.14, 1.02, 2.34, 3.58, 4.72, 5.57]
    anchor_offsets = [380, 470, 560, 420, 510, 600]

    for index, node in enumerate(nodes):
        rank = rank_lookup[index]
        ratio = rank / total
        degree_bias = 1 - min(1.0, node["degree_norm"])
        evidence_bias = min(1.0, node["evidence_norm"])

        field_angle = (
            _hash_unit(node["id"], "field-angle") * math.tau * 0.68
            + ratio * math.tau * 1.34
            + (_hash_unit(node["group"], "field-group") - 0.5) * 0.92
        )
        field_radius = 180 + math.sqrt(rank + 1) * 28 + degree_bias * 320 + evidence_bias * 85
        field_x, field_y = _polar(field_angle, field_radius)
        field_x += (_hash_unit(node["id"], "field-x") - 0.5) * 240
        field_y = field_y * 0.78 + (_hash_unit(node["id"], "field-y") - 0.5) * 170

        # Light deterministic repulsion keeps the center from collapsing into a tight hub.
        center_push = 36 + degree_bias * 34
        if abs(field_x) + abs(field_y) < 520:
            field_x += math.copysign(center_push, field_x or (_hash_unit(node["id"], "field-px") - 0.5))
            field_y += math.copysign(center_push * 0.72, field_y or (_hash_unit(node["id"], "field-py") - 0.5))
        layouts["field"].append([round(field_x, 2), round(field_y, 2)])

        raw_group = groups[index]
        group_key = raw_group if raw_group in cluster_lookup else "other"
        cluster_index = cluster_lookup[group_key]
        anchor_angle = anchor_angles[cluster_index % len(anchor_angles)]
        anchor_radius = anchor_offsets[cluster_index % len(anchor_offsets)]
        anchor_x, anchor_y = _polar(anchor_angle, anchor_radius)
        local_angle = _hash_unit(node["id"], "cluster-flow-angle") * math.tau
        local_radius = 28 + math.sqrt(rank + 1) * 8 + node["degree_norm"] * 26
        sway = (_hash_unit(node["id"], "cluster-flow-sway") - 0.5) * 120
        flow_x = anchor_x + math.cos(local_angle) * local_radius + sway
        flow_y = anchor_y * 0.72 + math.sin(local_angle * 1.18) * (local_radius * 0.86)
        if group_key == "other":
            flow_x *= 0.96
            flow_y *= 1.04
        layouts["cluster-flow"].append([round(flow_x, 2), round(flow_y, 2)])

    return layouts


def compact_graph(
    wisdom_rows: list[dict[str, str | None]], edge_rows: list[dict[str, str | None]]
) -> dict:
    nodes_by_id: dict[str, dict] = {}
    group_candidates: list[str] = []

    for row in wisdom_rows:
        node_id = row.get("id")
        if not node_id:
            continue
        stage = row.get("stage")
        evidence = _safe_int(row.get("evidence_count"))
        score = _score_wisdom(row)
        group = stage or row.get("p_id") or "ungrouped"
        group_candidates.append(group)
        nodes_by_id[node_id] = {
            "id": node_id,
            "label": _summarize_label(row.get("method")),
            "detail": _summarize_label(row.get("method"), max_length=280),
            "stage": stage,
            "group": group,
            "evidence": evidence,
            "score": score,
            "parent": row.get("p_id"),
            "child": row.get("c_id"),
            "referenceCount": 0 if not row.get("references") else row["references"].count('",'),
            "degree": 0,
        }

    ordered_ids = sorted(nodes_by_id)
    index_by_id = {node_id: idx for idx, node_id in enumerate(ordered_ids)}

    edge_type_counter: Counter[str] = Counter()
    edge_source_counter: Counter[str] = Counter()
    stages: set[str] = set()
    skipped_edges = 0
    compact_edges: list[list[int | float]] = []

    for row in edge_rows:
        source_id = row.get("from_wisdom_id")
        target_id = row.get("to_wisdom_id")
        if source_id not in index_by_id or target_id not in index_by_id:
            skipped_edges += 1
            continue

        edge_type = row.get("edge_type") or "unknown"
        edge_source = row.get("source") or "unknown"
        weight = round((_safe_float(row.get("S")) * 0.65) + (_safe_float(row.get("N")) * 0.35), 4)
        compact_edges.append(
            [
                index_by_id[source_id],
                index_by_id[target_id],
                edge_type,
                edge_source,
                weight,
            ]
        )
        nodes_by_id[source_id]["degree"] += 1
        nodes_by_id[target_id]["degree"] += 1
        edge_type_counter[edge_type] += 1
        edge_source_counter[edge_source] += 1

    nodes = [nodes_by_id[node_id] for node_id in ordered_ids]
    max_degree = max((node["degree"] for node in nodes), default=1)
    max_evidence = max((node["evidence"] for node in nodes), default=1)

    for node in nodes:
        if node["stage"]:
            stages.add(node["stage"])
        node["degree_norm"] = round(node["degree"] / max_degree, 4)
        node["size"] = round(2.0 + 7.0 * math.sqrt(node["degree_norm"] or 0.01), 2)
        node["evidence_norm"] = round(node["evidence"] / max(1, max_evidence), 4)

    groups = [node["group"] for node in nodes]
    layouts = _build_layouts(nodes, groups)

    edge_types = sorted(edge_type_counter)
    edge_sources = sorted(edge_source_counter)
    edge_type_index = {name: idx for idx, name in enumerate(edge_types)}
    edge_source_index = {name: idx for idx, name in enumerate(edge_sources)}

    encoded_edges = [
        [src, dst, edge_type_index[edge_type], edge_source_index[edge_source], weight]
        for src, dst, edge_type, edge_source, weight in compact_edges
    ]

    return {
        "meta": {
            "nodeCount": len(nodes),
            "edgeCount": len(encoded_edges),
            "skippedEdges": skipped_edges,
            "generatedAt": datetime.now(UTC).isoformat(),
        },
        "filters": {
            "edgeTypes": edge_types,
            "edgeSources": edge_sources,
            "stages": sorted(stages),
        },
        "nodes": nodes,
        "edges": encoded_edges,
        "layouts": layouts,
    }


def load_graph_rows(path: str | Path) -> tuple[list[dict[str, str | None]], list[dict[str, str | None]]]:
    wisdom_rows: list[dict[str, str | None]] = []
    edge_rows: list[dict[str, str | None]] = []

    for table_name, payload in iter_table_payloads(path):
        if table_name == "wisdoms":
            wisdom_rows.extend(_table_rows(payload, WISDOM_COLUMNS))
        elif table_name == "wisdom_edges":
            edge_rows.extend(_table_rows(payload, EDGE_COLUMNS))

    return wisdom_rows, edge_rows


def build_graph_artifact(source_path: str | Path) -> dict:
    wisdom_rows, edge_rows = load_graph_rows(source_path)
    artifact = compact_graph(wisdom_rows, edge_rows)
    artifact["meta"]["sourceFile"] = Path(source_path).name
    return artifact


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("Usage: python3 scripts/build_wisdom_graph.py <input.dump> <output.json>")
        return 1

    input_path = Path(argv[1])
    output_path = Path(argv[2])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    artifact = build_graph_artifact(input_path)
    output_path.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":")))

    print(
        json.dumps(
            {
                "output": str(output_path),
                "nodes": artifact["meta"]["nodeCount"],
                "edges": artifact["meta"]["edgeCount"],
                "skippedEdges": artifact["meta"]["skippedEdges"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
