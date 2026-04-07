# Wisdom Graph Viewer Design

## Goal

Build a browser-based viewer for `wisdom_4k_test.dump` that feels closer to the visual language of `megacode.ai`: dark, restrained, editorial, and technical rather than decorative.

The graph must stop looking like a synthetic diagram generator. Layouts should divide into two clear categories:

- natural layouts: prioritize organic spatial distribution and atmospheric readability
- structured layouts: reveal clusters or directional relationships without rigid rings, trunks, spokes, or other visibly forced geometry

## Visual Thesis

The graph should read like a field of knowledge under tension, not like a neuroscience illustration or a dashboard toy.

Material and mood:

- deep charcoal and slate background
- low-saturation metallic highlights
- quiet, precise interface chrome
- density, drift, and hierarchy instead of loud shape metaphors

## Content Plan

Hero workspace:

- the graph canvas is the main surface
- controls stay compact and subordinate
- the inspector explains the current selection without competing for attention

Layout system:

- one natural layout as the default visual reading
- one structured layout for analytical reading
- names should describe behavior, not sell a metaphor

## Interaction Thesis

- layout switching should feel like a field rebalancing, not a shape morph
- selection should locally intensify neighborhoods rather than restyle the whole graph
- zoom should reveal density first, then labels, then local structure

## Core Problem With The Current Layouts

The current layouts expose their generation rules too clearly:

- `synapse` shows visible trunk and branch scaffolding
- `radial` reads as evenly distributed ring logic
- `clustered` uses overly literal cluster centers
- `nebula` is more organic than the others, but still feels procedurally theatrical rather than naturally distributed

This makes the graph feel artificial before the user understands the data.

## Recommended Layout System

Use precomputed coordinate sets generated offline, but change the layout family to the following:

### 1. Natural Field

This is the default layout.

Behavior:

- major hubs lightly shape the field
- smaller nodes distribute into pockets of density rather than strict orbits
- local spacing should avoid exact repetition and visible symmetry
- the whole graph should read as one field at far zoom and several soft regions at medium zoom

Generation principles:

- rank or importance can influence attraction, but not through explicit circles
- use deterministic noise, jitter relaxation, or blue-noise-like spacing to avoid clumping artifacts
- allow soft anisotropy so the cloud has drift and variation rather than perfect circular balance

Litmus check:

- if a user can identify the governing shape at first glance, the layout is too rigid

### 2. Cluster Flow

This is the structured layout.

Behavior:

- groups remain legible
- clusters should feel like uneven territories, not dots pinned to a wheel
- transitions between clusters should form weak flows and bridges
- the viewer should sense organization without seeing an obvious template

Generation principles:

- derive loose cluster anchors from group frequency or graph importance
- place anchors asymmetrically
- distribute nodes around anchors with irregular local density and directional bias
- preserve some empty corridors between large regions to improve readability

Litmus check:

- structure should be recognizable within a few seconds
- geometry should not be recognizable within a few seconds

## Layout Naming

Replace the current visible metaphor names with calmer names:

- `field` for the natural layout
- `cluster-flow` for the structured layout

Existing names such as `synapse` should be removed because they over-promise a semantic metaphor the viewer does not actually perceive.

## Rendering Direction

Rendering should stay on Canvas 2D with bounded cost.

Visual rules:

- no bright candy palette
- no multi-color category fireworks
- no heavy glow halos on every node
- use a restrained monochrome-to-brass palette with small variation by state
- edges should support texture and structure, not dominate the frame

Node behavior:

- default nodes should feel like particulate matter, not UI badges
- hub emphasis should come from density, subtle bloom, and scale, not saturated color alone
- selected nodes may intensify, but nearby nodes should remain visually related

## Progressive Detail Strategy

At far zoom:

- emphasize major hubs and field density
- suppress small-node noise

At medium zoom:

- reveal regional pockets and bridges
- show stronger edges only

At close zoom:

- reveal local neighbors, labels, and selected context

This behavior is required for both layouts.

## Data And Performance Approach

Keep the existing offline preprocessing model and compact JSON artifact.

Do not introduce runtime force simulation in the browser.

Allowed implementation techniques for better naturalism:

- deterministic pseudo-random offsets derived from node ids
- local relaxation passes during preprocessing
- asymmetrical anchor placement
- weighted density shaping from degree, evidence, or group size

Disallowed visual shortcuts:

- perfect rings
- evenly spaced spokes
- mirrored left/right branching systems
- strict grid-like cluster packing

## Viewer Behavior Requirements

- the default layout shown on load should be `field`
- layout switching should preserve selection and camera continuity
- the structured layout should remain readable without becoming diagrammatic
- the interface theme should align with the `megacode.ai` tone already introduced in the shell

## Testing And Verification

Verification should cover:

- layout generation produces the new `field` and `cluster-flow` coordinates
- no old layout labels remain in the UI
- the viewer still loads and transitions correctly
- visual review at desktop widths confirms the graph does not immediately read as rings, spokes, or trunks

## Deliverables

- updated preprocessing layout generation
- updated layout options in the frontend
- refined canvas styling to support the calmer MEGA Code-like theme
- preserved interaction model: pan, zoom, search, selection, filters, and layout interpolation

## Scope Boundaries

This change does not require:

- live physics simulation
- WebGL migration
- adding more layout modes
- semantic graph analysis beyond what is already available in the source data

## Notes

This workspace is not a git repository, so the design can be saved locally but not committed unless the project is moved into version control first.
