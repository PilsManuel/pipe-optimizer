import { useState, Fragment } from 'react'
import type { FormEvent } from 'react'

// ── Types ──────────────────────────────────────────────────────────

interface Material {
  id: string
  name: string
  stockLengthMm: number
}

interface Demand {
  id: string
  project: string
  materialId: string
  lengthMm: number
}

interface Pipe {
  cuts: Demand[]
  remainingMm: number
  stockLengthMm: number
  usableMm: number
}

type CutPlan = Record<string, Pipe[]>

// ── Constants ──────────────────────────────────────────────────────

const FIXED_WASTE = 110
const KERF = 2

const PROJECT_COLORS = [
  '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4',
  '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#f43f5e',
  '#6366f1', '#22d3ee', '#eab308', '#e879f9', '#2dd4bf',
]

let idCounter = 0
function nextId(): string {
  return String(++idCounter)
}

// ── Algorithm ──────────────────────────────────────────────────────

function optimize(materials: Material[], demands: Demand[]): CutPlan {
  const materialMap = new Map(materials.map(m => [m.id, m]))
  const grouped = new Map<string, Demand[]>()

  for (const d of demands) {
    const list = grouped.get(d.materialId) ?? []
    list.push(d)
    grouped.set(d.materialId, list)
  }

  const plan: CutPlan = {}

  for (const [materialId, pieces] of grouped) {
    const mat = materialMap.get(materialId)
    if (!mat) continue

    const usable = mat.stockLengthMm - FIXED_WASTE
    const sorted = [...pieces].sort((a, b) => b.lengthMm - a.lengthMm)
    const pipes: Pipe[] = []

    for (const piece of sorted) {
      if (piece.lengthMm > usable) continue

      const needed = piece.lengthMm + KERF
      let bestIdx = -1
      let bestRemaining = Infinity

      for (let i = 0; i < pipes.length; i++) {
        const pipe = pipes[i]
        if (pipe.remainingMm >= needed && pipe.remainingMm < bestRemaining) {
          bestIdx = i
          bestRemaining = pipe.remainingMm
        }
      }

      if (bestIdx >= 0) {
        pipes[bestIdx].cuts.push(piece)
        pipes[bestIdx].remainingMm -= needed
      } else {
        pipes.push({
          cuts: [piece],
          remainingMm: usable - needed,
          stockLengthMm: mat.stockLengthMm,
          usableMm: usable,
        })
      }
    }

    // Remove trailing kerf from last cut on each pipe (no cut after last piece)
    for (const pipe of pipes) {
      if (pipe.cuts.length > 0) {
        pipe.remainingMm += KERF
      }
    }

    plan[materialId] = pipes
  }

  return plan
}

// ── Helpers ────────────────────────────────────────────────────────

function getProjectColorMap(demands: Demand[]): Map<string, string> {
  const projects = [...new Set(demands.map(d => d.project))]
  const map = new Map<string, string>()
  projects.forEach((p, i) => map.set(p, PROJECT_COLORS[i % PROJECT_COLORS.length]))
  return map
}

function formatMm(mm: number): string {
  if (mm >= 1000) {
    const m = mm / 1000
    return Number.isInteger(m) ? `${m} m` : `${m.toFixed(1)} m`
  }
  return `${mm} mm`
}

// ── MaterialStep ───────────────────────────────────────────────────

function MaterialStep({
  materials,
  onAdd,
  onDelete,
}: {
  materials: Material[]
  onAdd: (m: Material) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [stockLength, setStockLength] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const len = parseFloat(stockLength)
    if (!name.trim() || isNaN(len) || len <= 0) return
    onAdd({ id: nextId(), name: name.trim(), stockLengthMm: len })
    setName('')
    setStockLength('')
  }

  return (
    <div>
      <h2>Materialien</h2>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Bezeichnung</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="z.B. DN50 Kupfer"
              />
            </div>
            <div className="form-group">
              <label>Rohrl&auml;nge (mm)</label>
              <input
                type="number"
                value={stockLength}
                onChange={e => setStockLength(e.target.value)}
                placeholder="z.B. 6000"
                min="1"
              />
            </div>
            <button type="submit" className="primary">
              Hinzuf&uuml;gen
            </button>
          </div>
        </form>
      </div>

      {materials.length === 0 ? (
        <p className="empty">Noch keine Materialien angelegt.</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Rohrl&auml;nge</th>
                <th>Nutzbar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {materials.map(m => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{formatMm(m.stockLengthMm)}</td>
                  <td>{formatMm(m.stockLengthMm - FIXED_WASTE)}</td>
                  <td>
                    <button className="danger" onClick={() => onDelete(m.id)}>
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── DemandStep ─────────────────────────────────────────────────────

function DemandStep({
  materials,
  demands,
  onAdd,
  onDelete,
  onClearAll,
  onOptimize,
}: {
  materials: Material[]
  demands: Demand[]
  onAdd: (d: Demand) => void
  onDelete: (id: string) => void
  onClearAll: () => void
  onOptimize: () => void
}) {
  const [project, setProject] = useState('')
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? '')
  const [length, setLength] = useState('')
  const [unit, setUnit] = useState<'mm' | 'm'>('mm')
  const [count, setCount] = useState('1')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const len = parseFloat(length)
    const cnt = parseInt(count)
    if (!project.trim() || !materialId || isNaN(len) || len <= 0 || isNaN(cnt) || cnt < 1) return

    const lengthMm = unit === 'm' ? len * 1000 : len
    for (let i = 0; i < cnt; i++) {
      onAdd({ id: nextId(), project: project.trim(), materialId, lengthMm })
    }
    setLength('')
    setCount('1')
  }

  const materialMap = new Map(materials.map(m => [m.id, m]))
  const grouped = new Map<string, Demand[]>()
  for (const d of demands) {
    const list = grouped.get(d.materialId) ?? []
    list.push(d)
    grouped.set(d.materialId, list)
  }

  return (
    <div>
      <h2>Bedarf</h2>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Projekt</label>
              <input
                type="text"
                value={project}
                onChange={e => setProject(e.target.value)}
                placeholder="z.B. EG Bad"
              />
            </div>
            <div className="form-group">
              <label>Material</label>
              <select value={materialId} onChange={e => setMaterialId(e.target.value)}>
                {materials.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>L&auml;nge</label>
              <input
                type="number"
                value={length}
                onChange={e => setLength(e.target.value)}
                placeholder={unit === 'mm' ? 'z.B. 2500' : 'z.B. 2.5'}
                min="0"
                step={unit === 'm' ? '0.001' : '1'}
              />
            </div>
            <div className="toggle-group">
              <button type="button" className={unit === 'mm' ? 'active' : ''} onClick={() => setUnit('mm')}>mm</button>
              <button type="button" className={unit === 'm' ? 'active' : ''} onClick={() => setUnit('m')}>m</button>
            </div>
            <div className="form-group count-input">
              <label>Anzahl</label>
              <input
                type="number"
                value={count}
                onChange={e => setCount(e.target.value)}
                min="1"
              />
            </div>
            <button type="submit" className="primary">
              Hinzuf&uuml;gen
            </button>
          </div>
        </form>
      </div>

      {demands.length === 0 ? (
        <p className="empty">Noch kein Bedarf angelegt.</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Projekt</th>
                <th>L&auml;nge</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...grouped.entries()].map(([matId, items]) => {
                const mat = materialMap.get(matId)
                return (
                  <Fragment key={matId}>
                    <tr className="group-header">
                      <td colSpan={3}>{mat?.name ?? matId}</td>
                    </tr>
                    {items.map(d => {
                      const tooLong = mat ? d.lengthMm > mat.stockLengthMm - FIXED_WASTE : false
                      return (
                        <tr key={d.id}>
                          <td>{d.project}</td>
                          <td>
                            {formatMm(d.lengthMm)}
                            {tooLong && <span className="too-long"> — zu lang!</span>}
                          </td>
                          <td>
                            <button className="danger" onClick={() => onDelete(d.id)}>
                              &times;
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          <div className="action-row">
            <button className="danger" onClick={onClearAll}>Alle l&ouml;schen</button>
            <div className="action-row-end">
              <button className="primary" onClick={onOptimize}>
                Optimieren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ResultStep ─────────────────────────────────────────────────────

function ResultStep({
  materials,
  demands,
  results,
}: {
  materials: Material[]
  demands: Demand[]
  results: CutPlan
}) {
  const materialMap = new Map(materials.map(m => [m.id, m]))
  const projectColors = getProjectColorMap(demands)

  // Compute stats
  let totalPipes = 0
  let totalStockMm = 0
  let totalUsedMm = 0
  let totalWasteMm = 0

  for (const [materialId, pipes] of Object.entries(results)) {
    const mat = materialMap.get(materialId)
    if (!mat) continue
    totalPipes += pipes.length
    for (const pipe of pipes) {
      totalStockMm += pipe.stockLengthMm
      const cutSum = pipe.cuts.reduce((sum, c) => sum + c.lengthMm, 0)
      totalUsedMm += cutSum
      totalWasteMm += pipe.remainingMm
    }
  }

  const efficiency = totalStockMm > 0 ? ((totalUsedMm / totalStockMm) * 100) : 0

  // Count too-long pieces
  const tooLongPieces: Demand[] = []
  for (const d of demands) {
    const mat = materialMap.get(d.materialId)
    if (mat && d.lengthMm > mat.stockLengthMm - FIXED_WASTE) {
      tooLongPieces.push(d)
    }
  }

  return (
    <div>
      <h2>Ergebnis</h2>

      <div className="card">
        <div className="stats-bar">
          <div className="stat">
            <span className="stat-value">{totalPipes}</span>
            <span className="stat-label">Rohre</span>
          </div>
          <div className="stat">
            <span className="stat-value">{efficiency.toFixed(1)}%</span>
            <span className="stat-label">Nutzungsgrad</span>
          </div>
          <div className="stat">
            <span className="stat-value">{(totalWasteMm / 1000).toFixed(2)} m</span>
            <span className="stat-label">Restverschnitt</span>
          </div>
        </div>

        <div className="legend">
          {[...projectColors.entries()].map(([proj, color]) => (
            <div className="legend-item" key={proj}>
              <div className="legend-swatch" style={{ background: color }} />
              <span>{proj}</span>
            </div>
          ))}
          <div className="legend-item">
            <div className="legend-swatch hatched" />
            <span>Fixabfall ({FIXED_WASTE} mm)</span>
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: 'var(--kerf-color)' }} />
            <span>S&auml;geschnitt ({KERF} mm)</span>
          </div>
          <div className="legend-item">
            <div className="legend-swatch" style={{ background: 'var(--waste-color)' }} />
            <span>Verschnitt</span>
          </div>
        </div>
      </div>

      {tooLongPieces.length > 0 && (
        <div className="card">
          <h3 className="too-long">Zu lange St&uuml;cke (nicht zugewiesen)</h3>
          <table>
            <thead>
              <tr>
                <th>Projekt</th>
                <th>Material</th>
                <th>L&auml;nge</th>
                <th>Max. nutzbar</th>
              </tr>
            </thead>
            <tbody>
              {tooLongPieces.map(d => {
                const mat = materialMap.get(d.materialId)
                return (
                  <tr key={d.id}>
                    <td>{d.project}</td>
                    <td>{mat?.name}</td>
                    <td>{formatMm(d.lengthMm)}</td>
                    <td>{mat ? formatMm(mat.stockLengthMm - FIXED_WASTE) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {Object.entries(results).map(([materialId, pipes]) => {
        const mat = materialMap.get(materialId)
        if (!mat || pipes.length === 0) return null

        return (
          <div key={materialId} className="pipe-group">
            <h3>{mat.name} — {formatMm(mat.stockLengthMm)}</h3>
            {pipes.map((pipe, pipeIdx) => {
              const stockLen = pipe.stockLengthMm
              const segments: { type: string; mm: number; label: string; color?: string; project?: string }[] = []

              // Fixed waste first
              segments.push({ type: 'fixed-waste', mm: FIXED_WASTE, label: `${FIXED_WASTE}` })

              // Cuts with kerf between them
              pipe.cuts.forEach((cut, cutIdx) => {
                const color = projectColors.get(cut.project) ?? '#666'
                segments.push({
                  type: 'cut',
                  mm: cut.lengthMm,
                  label: formatMm(cut.lengthMm),
                  color,
                  project: cut.project,
                })
                if (cutIdx < pipe.cuts.length - 1) {
                  segments.push({ type: 'kerf', mm: KERF, label: '' })
                }
              })

              // Remaining waste
              if (pipe.remainingMm > 0) {
                segments.push({ type: 'waste', mm: pipe.remainingMm, label: formatMm(pipe.remainingMm) })
              }

              return (
                <div key={pipeIdx} className="pipe-row">
                  <div className="pipe-label">Rohr {pipeIdx + 1}</div>
                  <div className="pipe-bar">
                    {segments.map((seg, segIdx) => {
                      const pct = (seg.mm / stockLen) * 100
                      const style: Record<string, string> = { width: `${pct}%` }
                      if (seg.type === 'cut' && seg.color) {
                        style.background = seg.color
                      }
                      const className = `segment ${seg.type === 'cut' ? '' : seg.type}`
                      return (
                        <div
                          key={segIdx}
                          className={className}
                          style={style}
                          title={seg.project ? `${seg.project}: ${seg.label}` : seg.label}
                        >
                          {pct > 5 ? seg.label : ''}
                        </div>
                      )
                    })}
                  </div>
                  <div className="pipe-tags">
                    {pipe.cuts.map((cut, cutIdx) => {
                      const color = projectColors.get(cut.project) ?? '#666'
                      return (
                        <span key={cutIdx} className="pipe-tag" style={{ background: color }}>
                          {cut.project}: {formatMm(cut.lengthMm)}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────

const STEP_LABELS = ['Material', 'Bedarf', 'Ergebnis']

function App() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [materials, setMaterials] = useState<Material[]>([])
  const [demands, setDemands] = useState<Demand[]>([])
  const [results, setResults] = useState<CutPlan | null>(null)

  function addMaterial(m: Material) {
    setMaterials(prev => [...prev, m])
  }

  function deleteMaterial(id: string) {
    setMaterials(prev => prev.filter(m => m.id !== id))
    setDemands(prev => prev.filter(d => d.materialId !== id))
    setResults(null)
  }

  function addDemand(d: Demand) {
    setDemands(prev => [...prev, d])
    setResults(null)
  }

  function deleteDemand(id: string) {
    setDemands(prev => prev.filter(d => d.id !== id))
    setResults(null)
  }

  function clearDemands() {
    setDemands([])
    setResults(null)
  }

  function runOptimize() {
    const plan = optimize(materials, demands)
    setResults(plan)
    setStep(3)
  }

  function goToStep(s: 1 | 2 | 3) {
    if (s === 2 && materials.length === 0) return
    if (s === 3 && !results) return
    setStep(s)
  }

  const maxReachedStep = results ? 3 : demands.length > 0 ? 2 : materials.length > 0 ? 2 : 1

  return (
    <>
      <h1>Rohr-Zuschnittoptimierung</h1>
      <p className="subtitle">1D Cutting Stock — Verschnittminimierung</p>

      <div className="steps">
        {STEP_LABELS.map((label, i) => {
          const s = (i + 1) as 1 | 2 | 3
          const isActive = step === s
          const isCompleted = !isActive && s < step
          const canGo = s <= maxReachedStep
          return (
            <button
              key={s}
              className={`step-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
              onClick={() => canGo && goToStep(s)}
              disabled={!canGo}
            >
              <span className="step-number">{s}</span>
              {label}
            </button>
          )
        })}
      </div>

      {step === 1 && (
        <>
          <MaterialStep materials={materials} onAdd={addMaterial} onDelete={deleteMaterial} />
          {materials.length > 0 && (
            <div className="nav-buttons">
              <button className="primary" onClick={() => setStep(2)}>
                Weiter zu Bedarf →
              </button>
            </div>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <DemandStep
            materials={materials}
            demands={demands}
            onAdd={addDemand}
            onDelete={deleteDemand}
            onClearAll={clearDemands}
            onOptimize={runOptimize}
          />
          <div className="nav-buttons">
            <button onClick={() => setStep(1)}>← Material</button>
            {demands.length > 0 && (
              <button className="primary" onClick={runOptimize}>
                Optimieren →
              </button>
            )}
          </div>
        </>
      )}

      {step === 3 && results && (
        <>
          <ResultStep materials={materials} demands={demands} results={results} />
          <div className="nav-buttons">
            <button onClick={() => setStep(2)}>← Bedarf anpassen</button>
            <button onClick={() => setStep(1)}>← Material</button>
          </div>
        </>
      )}
    </>
  )
}

export default App
