import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import BrushIcon from "@mui/icons-material/Brush";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

import type { MaskVolume, SliceVolume } from "../api/types";

type Tool = "brush" | "erase";

/** Imperative handle the parent dialog uses to read edits and revert. */
export interface SliceMaskEditorHandle {
  getMasks(): MaskVolume;
  getSlices(): SliceVolume;
  isDirty(): boolean;
  revert(): void;
}

interface SliceMaskEditorProps {
  /** Preprocessed slices, `(N, H, W)` float32, owned by the parent, edited in place. */
  slices: SliceVolume;
  /** Muscle masks, `(N, H, W)` uint8, edited in place by the brush/eraser. */
  masks: MaskVolume;
  /** Slice the viewer opens on (e.g. the max-muscle-area slice). */
  initialSliceIndex?: number;
  /** Fired whenever the dirty (unsaved-mask-edits) state flips. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Canvas slice viewer and brush/eraser mask editor. Operates on in-memory
 * volumes the parent owns, so it serves both a saved scan (loaded from the Core
 * Backend) and a fresh pipeline result (fetched from the AI Worker). Volume data
 * is mutated through refs and painted imperatively; React state per brush move
 * would be far too heavy.
 */
const SliceMaskEditor = forwardRef<SliceMaskEditorHandle, SliceMaskEditorProps>(function SliceMaskEditor(
  { slices, masks, initialSliceIndex = 0, onDirtyChange },
  ref,
) {
  const [h, w] = [slices.shape[1], slices.shape[2]];
  const sliceCount = slices.shape[0];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pristineMasksRef = useRef<Uint8Array>(masks.data.slice());
  const paintingRef = useRef(false);

  const [sliceIndex, setSliceIndex] = useState(Math.min(Math.max(0, initialSliceIndex), sliceCount - 1));
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(8);
  const [showMask, setShowMask] = useState(true);
  const [dirty, setDirty] = useState(false);

  const markDirty = useCallback(
    (next: boolean) => {
      setDirty((prev) => {
        if (prev !== next) onDirtyChange?.(next);
        return next;
      });
    },
    [onDirtyChange],
  );

  // Reset editing state when a different volume set is mounted.
  useEffect(() => {
    pristineMasksRef.current = masks.data.slice();
    setSliceIndex(Math.min(Math.max(0, initialSliceIndex), slices.shape[0] - 1));
    markDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slices, masks]);

  // Render the current slice + translucent red mask overlay.
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sliceLen = h * w;
    const base = sliceIndex * sliceLen;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < sliceLen; i++) {
      const v = slices.data[base + i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;

    const img = ctx.createImageData(w, h);
    for (let i = 0; i < sliceLen; i++) {
      const g = Math.round(((slices.data[base + i] - min) / range) * 255);
      let r = g;
      let gr = g;
      let b = g;
      if (showMask && masks.data[base + i]) {
        r = Math.min(255, Math.round(g * 0.4 + 215 * 0.6));
        gr = Math.round(g * 0.4);
        b = Math.round(g * 0.4);
      }
      const o = i * 4;
      img.data[o] = r;
      img.data[o + 1] = gr;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [sliceIndex, showMask, slices, masks, h, w]);

  useEffect(() => {
    render();
  }, [render]);

  useImperativeHandle(
    ref,
    () => ({
      getMasks: () => masks,
      getSlices: () => slices,
      isDirty: () => dirty,
      revert: () => {
        masks.data.set(pristineMasksRef.current);
        markDirty(false);
        render();
      },
    }),
    [masks, slices, dirty, markDirty, render],
  );

  const paintAt = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = Math.floor(((clientX - rect.left) / rect.width) * w);
      const cy = Math.floor(((clientY - rect.top) / rect.height) * h);
      const value = tool === "brush" ? 1 : 0;
      const base = sliceIndex * h * w;
      const radius = brushSize;
      let changed = false;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const px = cx + dx;
          const py = cy + dy;
          if (px < 0 || px >= w || py < 0 || py >= h) continue;
          const idx = base + py * w + px;
          if (masks.data[idx] !== value) {
            masks.data[idx] = value;
            changed = true;
          }
        }
      }
      if (changed) {
        markDirty(true);
        render();
      }
    },
    [tool, brushSize, sliceIndex, markDirty, render, masks, h, w],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!showMask) setShowMask(true);
    paintingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    paintAt(e.clientX, e.clientY);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (paintingRef.current) paintAt(e.clientX, e.clientY);
  };
  const handlePointerUp = () => {
    paintingRef.current = false;
  };
  // Scroll the slice stack with the wheel. Attached natively (not via React's
  // onWheel) because React registers wheel listeners as passive, so
  // preventDefault() there is ignored and the dialog/page scrolls instead.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (sliceCount <= 1) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 : -1;
      setSliceIndex((i) => Math.min(sliceCount - 1, Math.max(0, i + delta)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [sliceCount]);

  return (
    <Stack spacing={2} alignItems="center">
      <Box
        sx={{
          width: "100%",
          maxWidth: 512,
          aspectRatio: "1 / 1",
          bgcolor: "#000",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          width={w}
          height={h}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            cursor: "crosshair",
            imageRendering: "pixelated",
            touchAction: "none",
          }}
        />
      </Box>

      {/* Slice navigation */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%", maxWidth: 512 }}>
        <IconButton size="small" disabled={sliceIndex === 0} onClick={() => setSliceIndex((i) => Math.max(0, i - 1))}>
          <NavigateBeforeIcon />
        </IconButton>
        <Slider
          size="small"
          min={0}
          max={Math.max(0, sliceCount - 1)}
          value={sliceIndex}
          onChange={(_e, v) => setSliceIndex(v as number)}
          disabled={sliceCount <= 1}
        />
        <IconButton
          size="small"
          disabled={sliceIndex >= sliceCount - 1}
          onClick={() => setSliceIndex((i) => Math.min(sliceCount - 1, i + 1))}
        >
          <NavigateNextIcon />
        </IconButton>
        <Typography variant="body2" sx={{ minWidth: 64, textAlign: "right" }}>
          {sliceCount === 0 ? "-" : `${sliceIndex + 1} / ${sliceCount}`}
        </Typography>
      </Stack>

      {/* Editing tools */}
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ width: "100%", maxWidth: 512, justifyContent: "space-between" }}
      >
        <ToggleButtonGroup size="small" exclusive value={tool} onChange={(_e, v: Tool | null) => v && setTool(v)}>
          <ToggleButton value="brush">
            <BrushIcon fontSize="small" sx={{ mr: 0.5 }} /> Paint
          </ToggleButton>
          <ToggleButton value="erase">
            <RestartAltIcon fontSize="small" sx={{ mr: 0.5 }} /> Erase
          </ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 160, flexGrow: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Brush
          </Typography>
          <Slider size="small" min={1} max={30} value={brushSize} onChange={(_e, v) => setBrushSize(v as number)} />
          <Typography variant="caption" sx={{ minWidth: 28 }}>
            {brushSize}px
          </Typography>
        </Stack>

        <Tooltip title={showMask ? "Hide mask overlay" : "Show mask overlay"}>
          <IconButton size="small" onClick={() => setShowMask((s) => !s)}>
            {showMask ? <VisibilityIcon /> : <VisibilityOffIcon />}
          </IconButton>
        </Tooltip>
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Scroll to change slice, drag to {tool === "brush" ? "paint" : "erase"} muscle mask
      </Typography>
    </Stack>
  );
});

export default SliceMaskEditor;
