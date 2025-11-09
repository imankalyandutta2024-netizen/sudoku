"use client"

/**
 * SUDOKU SOLVER - Backtracking + Bitmasking Implementation
 *
 * Approach: This solver uses a backtracking algorithm enhanced with bitmasking for constraint
 * tracking. Instead of checking all candidates for each cell naively, we maintain three sets
 * of 9-bit masks (one per row, one per column, one per 3x3 box) where each bit represents
 * whether digit 1-9 is already used. Bitwise operations allow us to compute valid candidates
 * in O(1) time using AND/OR/XOR operations, significantly reducing constant factors compared
 * to naive backtracking.
 *
 * Complexity: O(9^k) where k is the number of empty cells, but bitmasking reduces the constant
 * factor by avoiding repeated linear scans for constraint checking.
 */

import { useState, useCallback, useEffect } from "react"

// Bitmask utilities
// Bit i (0-8) represents whether digit (i+1) is used
// Example: 0b000000001 means digit 1 is used, 0b111111111 means all digits 1-9 are used

type SudokuGrid = number[][]

interface SamplePuzzle {
  name: string
  difficulty: string
  puzzle: string
  solution: string
}

const SAMPLE_PUZZLES: SamplePuzzle[] = [
  {
    name: "Easy",
    difficulty: "easy",
    puzzle: "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    solution: "534678912672195348198342567859761423426853791713924856961537284287419635345286179",
  },
  {
    name: "Medium",
    difficulty: "medium",
    puzzle: "200080300060070084030500209000105408000000000402706000301007040720040060004010003",
    solution: "295487316168372584437591269976125438583649721412736895351967842729843156684215973",
  },
  {
    name: "Hard",
    difficulty: "hard",
    puzzle: "000000000000003085001020000000507000004000100090000000500000073002010000000040009",
    solution: "987654321246173985351928746128537694634892157795461832519286473472319568863745219",
  },
]

export default function SudokuSolver() {
  const [grid, setGrid] = useState<SudokuGrid>(() =>
    Array(9)
      .fill(0)
      .map(() => Array(9).fill(0)),
  )
  const [solvedCells, setSolvedCells] = useState<Set<string>>(new Set())
  const [conflicts, setConflicts] = useState<Set<string>>(new Set())
  const [solveTime, setSolveTime] = useState<number | null>(null)
  const [backtrackSteps, setBacktrackSteps] = useState<number>(0)
  const [message, setMessage] = useState<string>("")
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationMode, setAnimationMode] = useState(false)

  // Check if a grid is valid (no conflicts)
  const validateGrid = useCallback((grid: SudokuGrid): Set<string> => {
    const conflicts = new Set<string>()

    // Check rows
    for (let r = 0; r < 9; r++) {
      const seen = new Map<number, number[]>()
      for (let c = 0; c < 9; c++) {
        const val = grid[r][c]
        if (val > 0) {
          if (seen.has(val)) {
            seen.get(val)!.forEach((col) => conflicts.add(`${r}-${col}`))
            conflicts.add(`${r}-${c}`)
          } else {
            seen.set(val, [c])
          }
        }
      }
    }

    // Check columns
    for (let c = 0; c < 9; c++) {
      const seen = new Map<number, number[]>()
      for (let r = 0; r < 9; r++) {
        const val = grid[r][c]
        if (val > 0) {
          if (seen.has(val)) {
            seen.get(val)!.forEach((row) => conflicts.add(`${row}-${c}`))
            conflicts.add(`${r}-${c}`)
          } else {
            seen.set(val, [r])
          }
        }
      }
    }

    // Check 3x3 boxes
    for (let boxR = 0; boxR < 3; boxR++) {
      for (let boxC = 0; boxC < 3; boxC++) {
        const seen = new Map<number, Array<[number, number]>>()
        for (let r = boxR * 3; r < boxR * 3 + 3; r++) {
          for (let c = boxC * 3; c < boxC * 3 + 3; c++) {
            const val = grid[r][c]
            if (val > 0) {
              if (seen.has(val)) {
                seen.get(val)!.forEach(([row, col]) => conflicts.add(`${row}-${col}`))
                conflicts.add(`${r}-${c}`)
              } else {
                seen.set(val, [[r, c]])
              }
            }
          }
        }
      }
    }

    return conflicts
  }, [])

  // Update conflicts when grid changes
  useEffect(() => {
    const newConflicts = validateGrid(grid)
    setConflicts(newConflicts)
  }, [grid, validateGrid])

  /**
   * CORE SOLVER: Backtracking with Bitmasking
   *
   * We maintain three arrays of bitmasks:
   * - rowMask[r]: bits set for digits used in row r
   * - colMask[c]: bits set for digits used in column c
   * - boxMask[b]: bits set for digits used in box b (where b = (r/3)*3 + (c/3))
   *
   * For a cell (r,c), allowed digits are those where the bit is NOT set in any of the three masks.
   * We compute this as: ~(rowMask[r] | colMask[c] | boxMask[b]) & 0b111111111
   */
  const solveSudoku = useCallback(
    (
      grid: SudokuGrid,
      animate = false,
      onStep?: (grid: SudokuGrid, steps: number) => void,
    ): { solved: boolean; grid: SudokuGrid; steps: number } => {
      const result = Array(9)
        .fill(0)
        .map((_, i) => [...grid[i]])
      const rowMask = Array(9).fill(0)
      const colMask = Array(9).fill(0)
      const boxMask = Array(9).fill(0)
      let steps = 0

      // Initialize bitmasks based on the initial grid
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (result[r][c] > 0) {
            const digit = result[r][c]
            const bit = 1 << (digit - 1) // Convert digit 1-9 to bit position 0-8
            const box = Math.floor(r / 3) * 3 + Math.floor(c / 3)
            rowMask[r] |= bit
            colMask[c] |= bit
            boxMask[box] |= bit
          }
        }
      }

      /**
       * Backtracking function with bitmasking
       *
       * Strategy: Find the cell with minimum remaining values (MRV heuristic) to reduce
       * the search space. For that cell, try each valid digit using bitmask operations.
       */
      const backtrack = (): boolean => {
        steps++

        // Find empty cell with minimum remaining values (MRV heuristic)
        let minOptions = 10
        let bestR = -1
        let bestC = -1

        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (result[r][c] === 0) {
              const box = Math.floor(r / 3) * 3 + Math.floor(c / 3)
              // Compute allowed digits: bits NOT set in any of the three constraint masks
              const allowed = ~(rowMask[r] | colMask[c] | boxMask[box]) & 0b111111111
              // Count number of set bits (valid options)
              const count = countBits(allowed)

              if (count === 0) return false // No valid options, backtrack immediately
              if (count < minOptions) {
                minOptions = count
                bestR = r
                bestC = c
              }
            }
          }
        }

        // If no empty cell found, puzzle is solved
        if (bestR === -1) return true

        const r = bestR
        const c = bestC
        const box = Math.floor(r / 3) * 3 + Math.floor(c / 3)

        // Get allowed digits using bitmasking
        let allowed = ~(rowMask[r] | colMask[c] | boxMask[box]) & 0b111111111

        // Try each allowed digit
        while (allowed > 0) {
          // Extract lowest set bit using: allowed & -allowed
          // This gives us one valid digit to try
          const bit = allowed & -allowed
          const digit = Math.log2(bit) + 1 // Convert bit position back to digit 1-9

          // Place digit
          result[r][c] = digit
          rowMask[r] |= bit
          colMask[c] |= bit
          boxMask[box] |= bit

          // Animation callback (limit frequency to avoid performance issues)
          if (animate && onStep && steps % 50 === 0) {
            onStep([...result.map((row) => [...row])], steps)
          }

          // Recurse
          if (backtrack()) return true

          // Backtrack: remove digit
          result[r][c] = 0
          rowMask[r] &= ~bit
          colMask[c] &= ~bit
          boxMask[box] &= ~bit

          // Remove this bit from allowed to try next digit
          allowed &= ~bit
        }

        return false
      }

      const solved = backtrack()
      return { solved, grid: result, steps }
    },
    [],
  )

  // Count set bits in a number (number of valid options)
  const countBits = (n: number): number => {
    let count = 0
    while (n > 0) {
      count++
      n &= n - 1 // Remove lowest set bit
    }
    return count
  }

  const handleCellChange = (r: number, c: number, value: string) => {
    const num = Number.parseInt(value) || 0
    if (num >= 0 && num <= 9) {
      const newGrid = grid.map((row, rowIdx) => row.map((cell, colIdx) => (rowIdx === r && colIdx === c ? num : cell)))
      setGrid(newGrid)
      // Remove from solved cells if user edits
      const newSolved = new Set(solvedCells)
      newSolved.delete(`${r}-${c}`)
      setSolvedCells(newSolved)
      setMessage("")
    }
  }

  const handleSolve = async () => {
    if (conflicts.size > 0) {
      setMessage("❌ Please fix conflicts before solving")
      return
    }

    setMessage("Solving...")
    setIsAnimating(true)

    // Record which cells are initially filled
    const initialCells = new Set<string>()
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] > 0) {
          initialCells.add(`${r}-${c}`)
        }
      }
    }

    const startTime = performance.now()

    if (animationMode) {
      // Animated solving with delayed updates
      let currentGrid = grid.map((row) => [...row])
      const stepCallback = (updatedGrid: SudokuGrid, steps: number) => {
        currentGrid = updatedGrid
        setGrid([...updatedGrid.map((row) => [...row])])
        setBacktrackSteps(steps)
      }

      // Run solver in chunks to allow UI updates
      const result = await new Promise<{ solved: boolean; grid: SudokuGrid; steps: number }>((resolve) => {
        setTimeout(() => {
          resolve(solveSudoku(currentGrid, true, stepCallback))
        }, 100)
      })

      const endTime = performance.now()

      if (result.solved) {
        setGrid(result.grid)
        const solved = new Set<string>()
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (!initialCells.has(`${r}-${c}`) && result.grid[r][c] > 0) {
              solved.add(`${r}-${c}`)
            }
          }
        }
        setSolvedCells(solved)
        setSolveTime(endTime - startTime)
        setBacktrackSteps(result.steps)
        setMessage("✅ Solved successfully!")
      } else {
        setSolveTime(endTime - startTime)
        setBacktrackSteps(result.steps)
        setMessage("❌ Unsolvable puzzle")
      }
    } else {
      // Fast solving without animation
      const result = solveSudoku(grid, false)
      const endTime = performance.now()

      if (result.solved) {
        setGrid(result.grid)
        const solved = new Set<string>()
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (!initialCells.has(`${r}-${c}`) && result.grid[r][c] > 0) {
              solved.add(`${r}-${c}`)
            }
          }
        }
        setSolvedCells(solved)
        setSolveTime(endTime - startTime)
        setBacktrackSteps(result.steps)
        setMessage("✅ Solved successfully!")
      } else {
        setSolveTime(endTime - startTime)
        setBacktrackSteps(result.steps)
        setMessage("❌ Unsolvable puzzle")
      }
    }

    setIsAnimating(false)
  }

  const handleClear = () => {
    setGrid(
      Array(9)
        .fill(0)
        .map(() => Array(9).fill(0)),
    )
    setSolvedCells(new Set())
    setSolveTime(null)
    setBacktrackSteps(0)
    setMessage("")
  }

  const handleLoadExample = (puzzle: SamplePuzzle) => {
    const newGrid = Array(9)
      .fill(0)
      .map(() => Array(9).fill(0))
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9)
      const c = i % 9
      newGrid[r][c] = Number.parseInt(puzzle.puzzle[i]) || 0
    }
    setGrid(newGrid)
    setSolvedCells(new Set())
    setSolveTime(null)
    setBacktrackSteps(0)
    setMessage(`Loaded ${puzzle.name} puzzle`)
  }

  const handleValidate = () => {
    const newConflicts = validateGrid(grid)
    if (newConflicts.size > 0) {
      setMessage(`❌ Found ${newConflicts.size} conflicting cells`)
    } else {
      // Check if solved completely
      const isFilled = grid.every((row) => row.every((cell) => cell > 0))
      if (isFilled) {
        setMessage("✅ Valid and complete solution!")
      } else {
        setMessage("✅ No conflicts, but puzzle is incomplete")
      }
    }
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-4xl font-bold text-foreground">sudoku solver</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Powered by backtracking + bitmasking algorithm for efficient constraint solving
        </p>

        {/* Control buttons */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={handleSolve}
            disabled={isAnimating}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isAnimating ? "Solving..." : "Solve"}
          </button>
          <button
            onClick={handleClear}
            className="rounded-lg bg-secondary px-4 py-2 font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Clear
          </button>
          <button
            onClick={handleValidate}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground transition-colors hover:bg-accent/80"
          >
            Validate
          </button>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={animationMode}
                onChange={(e) => setAnimationMode(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              Animation Mode
            </label>
          </div>
        </div>

        {/* Sample puzzles */}
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-foreground">Load Example:</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_PUZZLES.map((puzzle) => (
              <button
                key={puzzle.name}
                onClick={() => handleLoadExample(puzzle)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-accent"
              >
                {puzzle.name}
              </button>
            ))}
          </div>
        </div>

        {/* Status message */}
        {message && <div className="mb-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">{message}</div>}

        {/* Stats */}
        {(solveTime !== null || backtrackSteps > 0) && (
          <div className="mb-4 flex gap-4 text-sm text-muted-foreground">
            {solveTime !== null && (
              <div>
                <span className="font-medium">Time:</span> {solveTime.toFixed(2)}ms
              </div>
            )}
            {backtrackSteps > 0 && (
              <div>
                <span className="font-medium">Steps:</span> {backtrackSteps.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Sudoku Grid */}
        <div className="inline-block rounded-lg border-4 border-foreground bg-card p-2">
          <div className="grid grid-cols-9 gap-0">
            {grid.map((row, r) =>
              row.map((cell, c) => {
                const isConflict = conflicts.has(`${r}-${c}`)
                const isSolved = solvedCells.has(`${r}-${c}`)
                const isRightBorder = (c + 1) % 3 === 0 && c < 8
                const isBottomBorder = (r + 1) % 3 === 0 && r < 8

                return (
                  <input
                    key={`${r}-${c}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={cell > 0 ? cell : ""}
                    onChange={(e) => handleCellChange(r, c, e.target.value)}
                    aria-label={`Cell row ${r + 1} column ${c + 1}`}
                    className={`
                      h-10 w-10 text-center text-lg font-medium
                      focus:outline-none focus:ring-2 focus:ring-ring focus:z-10
                      ${isRightBorder ? "border-r-2 border-r-foreground" : "border-r border-r-border"}
                      ${isBottomBorder ? "border-b-2 border-b-foreground" : "border-b border-b-border"}
                      ${isConflict ? "bg-destructive/20 text-destructive-foreground" : ""}
                      ${isSolved ? "bg-accent text-accent-foreground font-bold" : "bg-background text-foreground"}
                      ${!isConflict && !isSolved && cell > 0 ? "font-semibold" : ""}
                    `}
                  />
                )
              }),
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-card-foreground">
          <h2 className="mb-2 font-semibold">How to use:</h2>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Enter digits 1-9 in the grid cells (0 or empty for blank cells)</li>
            <li>Click "Validate" to check for conflicts (duplicates in rows/columns/boxes)</li>
            <li>Click "Solve" to automatically solve the puzzle using backtracking + bitmasking</li>
            <li>Enable "Animation Mode" to visualize the solving process (slower)</li>
            <li>Load example puzzles to test the solver with varying difficulties</li>
            <li>Solved cells are shown in bold with a colored background</li>
          </ul>

          <h3 className="mb-2 mt-4 font-semibold">Algorithm Details:</h3>
          <p className="text-muted-foreground leading-relaxed">
            This solver uses <strong>backtracking with bitmasking</strong> for efficient constraint checking. Three
            arrays of 9-bit masks track which digits (1-9) are used in each row, column, and 3×3 box. Bitwise AND/OR
            operations compute valid candidates in O(1) time, and the MRV (Minimum Remaining Values) heuristic selects
            the most constrained cell first, dramatically reducing the search space compared to naive backtracking.
          </p>
        </div>
      </div>
    </div>
  )
}
