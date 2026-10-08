import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {styleDefaults, samplings, filters, distances, dithers, numericKeys, bounds, presetValues, preset, batchCount, parseStyle, styleLabel, type StyleSettings, type Ranges} from '../settings';
import {gridSize} from '../image-core';
import {GeneratorClient} from './client';
import {BrowserPlatform} from './platform';
import {drawPattern} from './render';
import {validateBatchBudget, BATCH_WARNING_COUNT} from './limits';
import type {Pattern, WorkerEvent} from './model';

function Preview({pattern, cell = 8}: {pattern: Pattern; cell?: number}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {const canvas = ref.current!; canvas.width = pattern.width * cell; canvas.height = pattern.height * cell; drawPattern(canvas.getContext('2d')!, pattern, cell, false, 'none', 0); return () => {canvas.width = canvas.height = 1;};}, [pattern, cell]);
  return <canvas ref={ref} aria-label="Bead pattern preview"/>;
}
const names: Record<string, string> = {pre_blur: 'Pre-blur', sharpen: 'Sharpen', gamma: 'Gamma', contrast: 'Contrast', saturation: 'Saturation', dither_strength: 'Dither strength'};
function App() {
  const client = useRef(new GeneratorClient()), platform = useRef(new BrowserPlatform()), results = useRef<Pattern[]>([]), dirty = useRef(false);
  const [settings, setSettings] = useState<StyleSettings>({...styleDefaults});
  const [ranges, setRanges] = useState<Ranges>(preset('Quick Baseline'));
  const [mode, setMode] = useState<'single' | 'batch'>('single'), [presetName, setPresetName] = useState('Quick Baseline');
  const [source, setSource] = useState<{file: File; width: number; height: number} | null>(null);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('Choose an image to begin.'), [error, setError] = useState('');
  const [count, setCount] = useState(0), [progress, setProgress] = useState({done: 0, total: 1}), [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Pattern | null>(null), [importText, setImportText] = useState(''), [cell, setCell] = useState(40), [previewCell, setPreviewCell] = useState(8);
  const [ready, setReady] = useState<{blob: Blob; filename: string} | null>(null), [warning, setWarning] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), [enlarged, setEnlarged] = useState(false);
  useEffect(() => {const timer = setInterval(() => {if (dirty.current) {setCount(results.current.length); dirty.current = false;}}, 1000); return () => {clearInterval(timer); client.current.cancel(); platform.current.dispose();};}, []);
  useEffect(() => {if (enlarged) dialog.current?.showModal(); else dialog.current?.close();}, [enlarged]);
  useEffect(() => {setReady(null);}, [selected, cell]);
  function change<K extends keyof StyleSettings>(key: K, value: StyleSettings[K]) {setSettings(s => ({...s, [key]: value})); setWarning(false);}
  function fail(e: unknown) {setError(e instanceof Error ? e.message : String(e)); setBusy(false); setStatus('Operation stopped.');}
  function event(e: WorkerEvent) {
    if (e.type === 'error') fail(e.error.message);
    if (e.type === 'progress') setStatus(e.message);
    if (e.type === 'style') {results.current.push(e.item); dirty.current = true; setProgress({done: e.completed, total: e.total}); setStatus(`Generating ${e.completed.toLocaleString()} of ${e.total.toLocaleString()} styles…`);}
    if (e.type === 'complete') {setCount(results.current.length); dirty.current = false; setSelected(results.current[0] ?? null); setBusy(false); setStatus(`Finished: ${results.current.length.toLocaleString()} ${results.current.length === 1 ? 'style' : 'styles'}.`);}
    if (e.type === 'export') {setReady({blob: e.blob, filename: e.filename}); setBusy(false); setStatus('PNG ready. Use Download PNG to save it.');}
  }
  function accept(file: File) {
    if (busy) return;
    setError(''); setBusy(true); setStatus('Checking image…'); setSource(null); setReady(null); setSelected(null); results.current = []; setCount(0); setPage(0); setWarning(false);
    try {client.current.start({type: 'inspect', jobId: crypto.randomUUID(), file}, e => {if (e.type === 'inspected') {setSource({file, width: e.width, height: e.height}); setBusy(false); setStatus('Image ready. Choose settings and generate.');} else event(e);});} catch(e) {fail(e);}
  }
  let estimate = {count: 1, bytes: 0, width: 0, height: 0, error: ''};
  try {estimate.count = mode === 'batch' ? batchCount(ranges) : 1; if (source) {[estimate.width, estimate.height] = gridSize(source.width, source.height, settings.maxWidth, settings.maxHeight); estimate.bytes = validateBatchBudget(estimate.count, estimate.width, estimate.height);}} catch(e) {estimate.error = (e as Error).message;}
  function generate(confirmed = false) {
    if (!source || busy) return;
    if (estimate.error) {setError(estimate.error); return;}
    if (estimate.count > BATCH_WARNING_COUNT && !confirmed) {setWarning(true); return;}
    setWarning(false); setError(''); setReady(null); results.current = []; setCount(0); setPage(0); setSelected(null); setBusy(true); setProgress({done: 0, total: estimate.count});
    try {client.current.start({type: 'generate', jobId: crypto.randomUUID(), file: source.file, settings, ...(mode === 'batch' ? {ranges} : {})}, event);} catch(e) {fail(e);}
  }
  function cancel() {client.current.cancel(); setBusy(false); setCount(results.current.length); dirty.current = false; setSelected(s => s ?? results.current[0] ?? null); setStatus('Cancelled. Completed patterns remain available.');}
  function exportImage(labels: boolean) {if (!selected || busy) return; setBusy(true); setReady(null); setError(''); setStatus('Preparing PNG…'); try {client.current.start({type: 'export', jobId: crypto.randomUUID(), pattern: selected, cellSize: cell, labels, gridDisplay: labels ? 'white' : 'none'}, event);} catch(e) {fail(e);}}
  const pages = Math.max(1, Math.ceil(count / 12));
  return <><header><div className="brand">MARD / BEAD STUDIO</div><h1>Your artwork, bead by bead.</h1><p>Create, compare, and export. Your images stay in this browser.</p></header>
    <main onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) accept(file);}}>
      <div className="workspace"><aside><section><h2>1. Source image</h2><label className="upload">Choose image<input aria-label="Source image" type="file" accept="image/*" disabled={busy} onChange={e => {const f = e.target.files?.[0]; if (f) accept(f); e.target.value = '';}}/></label><p className="filename">{source ? `${source.file.name} · ${source.width} × ${source.height}` : 'Choose an image or drop it here.'}</p><p className="muted">Up to 16 megapixels. Originals remain unchanged.</p></section>
      <section><h2>2. Make it yours</h2><div className="tabs" aria-label="Generation mode"><button aria-pressed={mode === 'single'} onClick={() => {setMode('single'); setWarning(false);}}>Artistic</button><button aria-pressed={mode === 'batch'} onClick={() => {setMode('batch'); setWarning(false);}}>Batch</button></div>
      <fieldset disabled={busy}><legend>Bead grid</legend><div className="pair">{(['maxWidth', 'maxHeight'] as const).map(k => <label key={k}>Maximum {k === 'maxWidth' ? 'width' : 'height'}<input type="number" min="1" max="200" value={settings[k]} onChange={e => change(k, Number(e.target.value))}/></label>)}</div><p className="muted">Aspect ratio preserved. Typical maximum: 104 × 104 beads.</p>
      <details><summary>MARD color series · {settings.series.length} selected</summary><div className="series">{'ABCDEFGHM'.split('').map(s => <label key={s}><input type="checkbox" checked={settings.series.includes(s)} onChange={e => change('series', e.target.checked ? settings.series + s : settings.series.replace(s, ''))}/>{s}</label>)}</div></details></fieldset>
      {mode === 'single' ? <fieldset disabled={busy}><legend>Artistic settings</legend><div className="pair">{([['sampling', samplings], ['resize_filter', filters], ['distance', distances], ['dither', dithers]] as const).map(([key, values]) => <label key={key}>{key.replace('_', ' ')}<select value={settings[key]} onChange={e => change(key, e.target.value as never)}>{values.map(v => <option key={v}>{v}</option>)}</select></label>)}{numericKeys.map(key => <label key={key}>{names[key]}<input type="number" min={bounds[key][0]} max={bounds[key][1]} step={key === 'dither_strength' ? 1 : .05} value={settings[key]} onChange={e => change(key, Number(e.target.value))}/></label>)}</div></fieldset> : <fieldset disabled={busy}><legend>Batch settings</legend><label>Preset<select aria-label="Preset" value={presetName} onChange={e => {setPresetName(e.target.value); setRanges(preset(e.target.value)); setWarning(false);}}>{Object.keys(presetValues).map(v => <option key={v}>{v}</option>)}</select></label><p className="muted">Combines sampling, color distance, and dithering methods with these ranges.</p><div className="ranges"><div>Parameter</div><div>Min</div><div>Max</div><div>Step</div>{numericKeys.map(key => <React.Fragment key={key}><span>{names[key]}</span>{(['min', 'max', 'step'] as const).map(part => <input key={part} aria-label={`${names[key]} ${part}`} type="number" step="any" value={ranges[key][part]} onChange={e => {setRanges(r => ({...r, [key]: {...r[key], [part]: Number(e.target.value)}})); setWarning(false);}}/>)}</React.Fragment>)}</div></fieldset>}
      <details><summary>Import a saved style</summary><label>Generated filename or style label<textarea value={importText} onChange={e => setImportText(e.target.value)}/></label><button disabled={busy} onClick={() => {try {setSettings(s => ({...s, ...parseStyle(importText)})); setMode('single'); setError(''); setStatus('Style settings imported.');} catch(e) {fail(e);}}}>Apply style</button></details>
      <p>{estimate.count.toLocaleString()} {estimate.count === 1 ? 'style' : 'styles'}{source && !estimate.error ? ` · ${estimate.width} × ${estimate.height} beads · ~${(estimate.bytes / 1024 / 1024).toFixed(1)} MiB results` : ''}</p>{estimate.error && <p className="error">{estimate.error}</p>}
      {warning && <div className="notice" role="alert"><p>This batch contains {estimate.count.toLocaleString()} styles and may take a while. It fits the 64 MiB results budget. Keep this tab open.</p><button onClick={() => generate(true)}>Continue large batch</button><button onClick={() => setWarning(false)}>Back to settings</button></div>}
      <div className="actions"><button className="primary" disabled={busy || !source || !!estimate.error} onClick={() => generate()}>Generate {mode === 'batch' ? 'batch' : 'pattern'}</button><button disabled={!busy} onClick={cancel}>Cancel</button></div></section></aside>
      <div className="results"><section><div className="section-heading"><h2>3. Compare styles</h2><button disabled={busy || !count} onClick={() => {results.current = []; setCount(0); setSelected(null); setPage(0); setReady(null);}}>Clear gallery</button></div><p role="status">{status}</p><progress aria-label="Generation progress" max={progress.total} value={progress.done}/>{error && <p className="error" role="alert">{error}</p>}
      {!count && <div className="empty">Your patterns will appear here.<span>Try Quick Baseline to explore 96 variations.</span></div>}
      <div className="gallery">{results.current.slice(page * 12, Math.min(count, page * 12 + 12)).map((item, i) => <button key={item.id} aria-label={`Select style ${page * 12 + i + 1}`} aria-pressed={selected?.id === item.id} disabled={busy} onClick={() => {setReady(null); setSelected(item);}}><Preview pattern={item} cell={4}/><span>Style {page * 12 + i + 1}</span></button>)}</div>
      <div className="pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page + 1} / {pages} · {count.toLocaleString()} styles</span><button disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Next</button></div></section>
      {selected && <section><h2>4. Inspect & export</h2><p>{selected.width} × {selected.height} beads · {Object.keys(selected.counts).length} colors · {(selected.width * selected.height).toLocaleString()} beads</p><label>Preview detail<select value={previewCell} onChange={e => setPreviewCell(Number(e.target.value))}>{[8,12,20].map(v => <option key={v} value={v}>{v} pixels per bead</option>)}</select></label><button className="selected-preview" aria-label="Enlarge selected pattern" onClick={() => setEnlarged(true)}><Preview pattern={selected} cell={previewCell}/></button><p className="muted">Click the preview to inspect at full size.</p><details><summary>Style settings & bead counts</summary><p className="style-label">{styleLabel(selected.settings)}</p><button disabled={busy} onClick={() => {setSettings({...selected.settings}); setMode('single'); setStatus('Selected style copied to artistic controls.');}}>Use these settings</button><div className="counts">{Object.entries(selected.counts).sort(([a], [b]) => a.localeCompare(b)).map(([code, n]) => <span key={code}>{code}: {n}</span>)}</div></details><label>Final PNG size<select disabled={busy} value={cell} onChange={e => setCell(Number(e.target.value))}><option value={40}>40 pixels per bead (recommended)</option><option value={32}>32 pixels per bead (smaller file)</option></select></label><p className="muted">Labeled exports use white grid lines and large color codes for PixDotDot.</p><div className="actions"><button disabled={busy} onClick={() => exportImage(true)}>Prepare labeled PNG</button><button disabled={busy} onClick={() => exportImage(false)}>Prepare unlabeled PNG</button>{ready && <button className="primary" onClick={() => platform.current.downloadFile(ready.blob, ready.filename)}>Download PNG · {(ready.blob.size / 1024).toFixed(0)} KiB</button>}</div></section>}
      </div></div><footer>Patterns stay in memory. Download your favorites before closing or reloading this tab.</footer>
    </main><dialog ref={dialog} onCancel={() => setEnlarged(false)}><button onClick={() => setEnlarged(false)}>Close preview</button><div className="zoom">{enlarged && selected && <Preview pattern={selected} cell={previewCell}/>}</div></dialog></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
