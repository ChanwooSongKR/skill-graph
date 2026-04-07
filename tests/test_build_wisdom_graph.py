import unittest

from scripts.build_wisdom_graph import compact_graph, parse_copy_row


class ParseCopyRowTests(unittest.TestCase):
    def test_parse_copy_row_converts_null_and_keeps_columns(self) -> None:
        row = parse_copy_row(
            "id1\tparent\tchild\trel\ttext body\t\\N\t{ref}\t0.9\t0.8\t0.7\t0.6\t3\t[0.1]\t2026-01-01"
        )
        self.assertEqual(row[0], "id1")
        self.assertIsNone(row[5])
        self.assertEqual(row[11], "3")


class CompactGraphTests(unittest.TestCase):
    def test_compact_graph_builds_filter_metadata_and_index_edges(self) -> None:
        graph = compact_graph(
            [
                {
                    "id": "w1",
                    "p_id": "p1",
                    "c_id": "c1",
                    "r_id": "r1",
                    "method": "Alpha insight",
                    "stage": None,
                    "references": "{ref1}",
                    "cp_S": "0.9",
                    "cp_N": "0.8",
                    "pr_S": "0.7",
                    "pr_N": "0.6",
                    "evidence_count": "2",
                },
                {
                    "id": "w2",
                    "p_id": "p2",
                    "c_id": "c2",
                    "r_id": "r2",
                    "method": "Beta insight",
                    "stage": "synth",
                    "references": "{ref2}",
                    "cp_S": "0.5",
                    "cp_N": "0.4",
                    "pr_S": "0.6",
                    "pr_N": "0.5",
                    "evidence_count": "4",
                },
            ],
            [
                {
                    "id": "e1",
                    "from_wisdom_id": "w1",
                    "to_wisdom_id": "w2",
                    "edge_type": "suff",
                    "S": "1",
                    "N": "0.5",
                    "source": "aggregation",
                    "reason": "shared_context",
                }
            ],
        )
        self.assertEqual(graph["meta"]["nodeCount"], 2)
        self.assertEqual(graph["meta"]["edgeCount"], 1)
        self.assertEqual(graph["edges"][0][0], 0)
        self.assertEqual(graph["edges"][0][1], 1)
        self.assertIn("suff", graph["filters"]["edgeTypes"])
        self.assertIn("synth", graph["filters"]["stages"])
        self.assertEqual(graph["nodes"][0]["id"], "w1")
        self.assertEqual(sorted(graph["layouts"].keys()), ["cluster-flow", "field"])
        self.assertEqual(len(graph["layouts"]["field"]), 2)
        self.assertEqual(len(graph["layouts"]["cluster-flow"]), 2)

    def test_compact_graph_does_not_emit_legacy_layout_names(self) -> None:
        graph = compact_graph(
            [
                {
                    "id": "w1",
                    "p_id": "p1",
                    "c_id": "c1",
                    "r_id": "r1",
                    "method": "Alpha insight",
                    "stage": None,
                    "references": "{ref1}",
                    "cp_S": "0.9",
                    "cp_N": "0.8",
                    "pr_S": "0.7",
                    "pr_N": "0.6",
                    "evidence_count": "2",
                },
                {
                    "id": "w2",
                    "p_id": "p2",
                    "c_id": "c2",
                    "r_id": "r2",
                    "method": "Beta insight",
                    "stage": "synth",
                    "references": "{ref2}",
                    "cp_S": "0.5",
                    "cp_N": "0.4",
                    "pr_S": "0.6",
                    "pr_N": "0.5",
                    "evidence_count": "4",
                },
            ],
            [
                {
                    "id": "e1",
                    "from_wisdom_id": "w1",
                    "to_wisdom_id": "w2",
                    "edge_type": "suff",
                    "S": "1",
                    "N": "0.5",
                    "source": "aggregation",
                    "reason": "shared_context",
                }
            ],
        )
        self.assertNotIn("nebula", graph["layouts"])
        self.assertNotIn("radial", graph["layouts"])
        self.assertNotIn("clustered", graph["layouts"])
        self.assertNotIn("synapse", graph["layouts"])


if __name__ == "__main__":
    unittest.main()
