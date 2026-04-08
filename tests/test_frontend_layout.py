import unittest
from html.parser import HTMLParser
from pathlib import Path


class LayoutStructureParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stack: list[tuple[str, str]] = []
        self.graph_hud_parent_classes: list[str] = []
        self.inspector_parent_classes: list[str] = []
        self.graph_stage_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        classes = attrs_dict.get("class", "") or ""
        self.stack.append((tag, classes))

        class_tokens = set(classes.split())
        parent_classes = self.stack[-2][1] if len(self.stack) > 1 else ""

        if "graph-stage" in class_tokens:
            self.graph_stage_count += 1
        if "graph-hud" in class_tokens:
            self.graph_hud_parent_classes.append(parent_classes)
        if "inspector" in class_tokens:
            self.inspector_parent_classes.append(parent_classes)

    def handle_endtag(self, tag: str) -> None:
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()


class FrontendLayoutTests(unittest.TestCase):
    def test_graph_hud_is_nested_inside_graph_stage_instead_of_viewport(self) -> None:
        parser = LayoutStructureParser()
        html = Path("public/index.html").read_text(encoding="utf-8")
        parser.feed(html)

        self.assertEqual(parser.graph_stage_count, 1)
        self.assertEqual(parser.graph_hud_parent_classes, ["graph-stage"])
        self.assertEqual(parser.inspector_parent_classes, ["viewport"])


if __name__ == "__main__":
    unittest.main()
