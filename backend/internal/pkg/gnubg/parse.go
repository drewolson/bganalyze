package gnubg

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ParseMatchFiles discovers analysis.txt + analysis_NNN.txt files in dir,
// parses each, and assembles a MatchData.
func ParseMatchFiles(dir string) (*MatchData, error) {
	files, err := discoverFiles(dir)
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no analysis files found in %s", dir)
	}

	md := &MatchData{}
	for i, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", f, err)
		}
		lines := strings.Split(string(data), "\n")

		game, gameStats, matchStats, err := parseFile(lines, i+1)
		if err != nil {
			return nil, fmt.Errorf("parsing %s: %w", f, err)
		}

		// Extract player names and match length from first file
		if i == 0 {
			md.Player1, md.Player2, md.MatchLength, err = parseScoreLine(lines)
			if err != nil {
				return nil, fmt.Errorf("parsing score line in %s: %w", f, err)
			}
		}

		game.Stats = gameStats
		md.Games = append(md.Games, *game)

		if matchStats != nil {
			md.MatchStats = matchStats
		}
	}

	return md, nil
}

func discoverFiles(dir string) ([]string, error) {
	main := filepath.Join(dir, "analysis.txt")
	if _, err := os.Stat(main); err != nil {
		return nil, fmt.Errorf("analysis.txt not found: %w", err)
	}

	files := []string{main}

	// Find analysis_NNN.txt files
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var numbered []string
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "analysis_") && strings.HasSuffix(name, ".txt") {
			numbered = append(numbered, filepath.Join(dir, name))
		}
	}
	sort.Strings(numbered)
	files = append(files, numbered...)

	return files, nil
}

var (
	reScore       = regexp.MustCompile(`^The score \(after \d+ games?\) is: (.+?) (\d+), (.+?) (\d+) \(match to (\d+)`)
	reMoveHeader  = regexp.MustCompile(`^Move number (\d+):\s+(.+?) to play (\d)(\d)`)
	reCubeDecQ    = regexp.MustCompile(`^Move number (\d+):\s+(.+?) on roll, cube decision\?`)
	reDoubleTo    = regexp.MustCompile(`^Move number (\d+):\s+(.+?) doubles to (\d+)`)
	reActionMove  = regexp.MustCompile(`^\* (.+?) moves (.+)`)
	reActionNoMv  = regexp.MustCompile(`^\* (.+?) cannot move`)
	reActionDbl   = regexp.MustCompile(`^\* (.+?) doubles`)
	reActionRej   = regexp.MustCompile(`^\* (.+?) rejects`)
	reActionTake  = regexp.MustCompile(`^\* (.+?) accepts`)
	reAlert       = regexp.MustCompile(`^Alert: (.+)`)
	rePositionID  = regexp.MustCompile(`Position ID: (\S+)`)
	reMatchID     = regexp.MustCompile(`Match ID\s*: (\S+)`)
	rePipCounts   = regexp.MustCompile(`^Pip counts: O (\d+), X (\d+)`)
	reRolled      = regexp.MustCompile(`^Rolled (\d)(\d) \(([+-]\d+\.\d+)\):`)
	reCannotMove  = regexp.MustCompile(`^\*\s+Cannot move`)
	reAltChosen   = regexp.MustCompile(`^\*\s+(\d+)\.\s+Cubeful\s+(\S+-ply)\s+(.+?)\s{2,}Eq\.:\s+([+-]\d+\.\d+)(?:\s+\(([+-]\d+\.\d+)\))?`)
	reAltOther    = regexp.MustCompile(`^\s+(\d+)\.\s+Cubeful\s+(\S+-ply)\s+(.+?)\s{2,}Eq\.:\s+([+-]\d+\.\d+)(?:\s+\(([+-]\d+\.\d+)\))?`)
	reProbs       = regexp.MustCompile(`^\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+-\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)`)
	reCubeAnalHdr = regexp.MustCompile(`^Cube analysis`)
	reCubeless    = regexp.MustCompile(`^(\d)-ply cubeless equity ([+-]\d+\.\d+)`)
	reNoDouble    = regexp.MustCompile(`^(\d+)\.\s+No double\s+([+-]\d+\.\d+)`)
	reDoublPass   = regexp.MustCompile(`^(\d+)\.\s+Double, pass\s+([+-]\d+\.\d+)`)
	reDoublTake   = regexp.MustCompile(`^(\d+)\.\s+Double, take\s+([+-]\d+\.\d+)`)
	reProperCube  = regexp.MustCompile(`^Proper cube action: (.+)`)
	reGameResult  = regexp.MustCompile(`^(.+?) wins (\d+) points?`)
	reGameStats   = regexp.MustCompile(`^Game statistics for game`)
	reMatchStats  = regexp.MustCompile(`^Match statistics`)
)

func parseScoreLine(lines []string) (player1, player2 string, matchLen int, err error) {
	for _, line := range lines {
		m := reScore.FindStringSubmatch(line)
		if m != nil {
			player1 = m[1]
			player2 = m[3]
			matchLen, _ = strconv.Atoi(m[5])
			s1, _ := strconv.Atoi(m[2])
			s2, _ := strconv.Atoi(m[4])
			_ = s1
			_ = s2
			return
		}
	}
	return "", "", 0, fmt.Errorf("score line not found")
}

func parseFile(lines []string, gameNumber int) (*Game, *StatBlock, *StatBlock, error) {
	game := &Game{GameNumber: gameNumber}

	// Parse score from header
	for _, line := range lines {
		m := reScore.FindStringSubmatch(line)
		if m != nil {
			s1, _ := strconv.Atoi(m[2])
			s2, _ := strconv.Atoi(m[4])
			game.ScoreBefore = [2]int{s1, s2}
			break
		}
	}

	var (
		currentMove  *Move
		inCubeAnal   bool
		cubeAnal     *CubeAnalysis
		inMoveAnal   bool
		moveAnal     *MoveAnalysis
		lastAlt      *Alternative
		gameStats    *StatBlock
		matchStats   *StatBlock
		inGameStats  bool
		inMatchStats bool
		statsLines   []string
	)

	flushMove := func() {
		if currentMove == nil {
			return
		}
		if cubeAnal != nil {
			currentMove.CubeAnalysis = cubeAnal
			cubeAnal = nil
		}
		if moveAnal != nil {
			// Determine chosen rank
			for _, alt := range moveAnal.Alternatives {
				if alt.IsChosen {
					moveAnal.ChosenRank = alt.Rank
					break
				}
			}
			currentMove.MoveAnalysis = moveAnal
			moveAnal = nil
		}
		inCubeAnal = false
		inMoveAnal = false
		lastAlt = nil
		game.Moves = append(game.Moves, *currentMove)
		currentMove = nil
	}

	for i := range lines {
		line := lines[i]

		// Check for stats sections
		if reGameStats.MatchString(line) {
			flushMove()
			inGameStats = true
			inMatchStats = false
			statsLines = nil
			continue
		}
		if reMatchStats.MatchString(line) {
			if inGameStats && statsLines != nil {
				gameStats = parseStatBlock(statsLines)
			}
			inGameStats = false
			inMatchStats = true
			statsLines = nil
			continue
		}
		if inGameStats || inMatchStats {
			statsLines = append(statsLines, line)
			continue
		}

		// Game result
		if m := reGameResult.FindStringSubmatch(line); m != nil {
			flushMove()
			game.Winner = m[1]
			game.PointsWon, _ = strconv.Atoi(m[2])
			continue
		}

		// Move headers
		if m := reMoveHeader.FindStringSubmatch(line); m != nil {
			flushMove()
			num, _ := strconv.Atoi(m[1])
			d1, _ := strconv.Atoi(m[3])
			d2, _ := strconv.Atoi(m[4])
			currentMove = &Move{
				Number: num,
				Player: m[2],
				Type:   "checker",
				Dice:   [2]int{d1, d2},
			}
			continue
		}
		if m := reCubeDecQ.FindStringSubmatch(line); m != nil {
			flushMove()
			num, _ := strconv.Atoi(m[1])
			currentMove = &Move{
				Number: num,
				Player: m[2],
				Type:   "cube_decision",
			}
			continue
		}
		if m := reDoubleTo.FindStringSubmatch(line); m != nil {
			if currentMove != nil && currentMove.Type == "cube_decision" {
				// Convert cube_decision into double, keeping CubeAnalysis
				num, _ := strconv.Atoi(m[1])
				currentMove.Number = num
				currentMove.Player = m[2]
				currentMove.Type = "double"
				currentMove.Action = fmt.Sprintf("doubles to %s", m[3])
			} else {
				flushMove()
				num, _ := strconv.Atoi(m[1])
				currentMove = &Move{
					Number: num,
					Player: m[2],
					Type:   "double",
					Action: fmt.Sprintf("doubles to %s", m[3]),
				}
			}
			continue
		}

		if currentMove == nil {
			continue
		}

		// Position/Match IDs
		if m := rePositionID.FindStringSubmatch(line); m != nil {
			currentMove.PositionID = m[1]
			continue
		}
		if m := reMatchID.FindStringSubmatch(line); m != nil {
			currentMove.MatchID = m[1]
			continue
		}

		// Pip counts
		if m := rePipCounts.FindStringSubmatch(line); m != nil {
			p1, _ := strconv.Atoi(m[1])
			p2, _ := strconv.Atoi(m[2])
			currentMove.PipCounts = [2]int{p1, p2}
			continue
		}

		// Actions
		if m := reActionMove.FindStringSubmatch(line); m != nil {
			currentMove.Action = m[2]
			if currentMove.Type == "" {
				currentMove.Type = "checker"
			}
			continue
		}
		if m := reActionNoMv.FindStringSubmatch(line); m != nil {
			currentMove.Type = "cannot_move"
			currentMove.Action = "cannot move"
			continue
		}
		if reActionDbl.MatchString(line) {
			if currentMove.Type == "cube_decision" {
				currentMove.Action = "doubles"
			}
			continue
		}
		if m := reActionRej.FindStringSubmatch(line); m != nil {
			// Reject is a response to a double — flush the double first, then create a new move
			if currentMove.Type == "double" {
				prevNum := currentMove.Number
				prevPosID := currentMove.PositionID
				prevMatchID := currentMove.MatchID
				prevPips := currentMove.PipCounts
				flushMove()
				currentMove = &Move{
					Number:     prevNum,
					Player:     m[1],
					Type:       "reject",
					Action:     "rejects",
					PositionID: prevPosID,
					MatchID:    prevMatchID,
					PipCounts:  prevPips,
				}
			} else {
				currentMove.Type = "reject"
				currentMove.Action = "rejects"
			}
			continue
		}
		if m := reActionTake.FindStringSubmatch(line); m != nil {
			if currentMove.Type == "double" {
				prevNum := currentMove.Number
				prevPosID := currentMove.PositionID
				prevMatchID := currentMove.MatchID
				prevPips := currentMove.PipCounts
				flushMove()
				currentMove = &Move{
					Number:     prevNum,
					Player:     m[1],
					Type:       "take",
					Action:     "accepts",
					PositionID: prevPosID,
					MatchID:    prevMatchID,
					PipCounts:  prevPips,
				}
			} else {
				currentMove.Type = "take"
				currentMove.Action = "accepts"
			}
			continue
		}

		// Alerts
		if m := reAlert.FindStringSubmatch(line); m != nil {
			currentMove.Alerts = append(currentMove.Alerts, m[1])
			continue
		}

		// Cube analysis block
		if reCubeAnalHdr.MatchString(line) {
			inCubeAnal = true
			cubeAnal = &CubeAnalysis{}
			continue
		}
		if inCubeAnal {
			if m := reCubeless.FindStringSubmatch(line); m != nil {
				cubeAnal.CubelessEquity = parseFloat(m[2])
				continue
			}
			if m := reNoDouble.FindStringSubmatch(line); m != nil {
				cubeAnal.NoDouble = parseFloat(m[2])
				continue
			}
			if m := reDoublPass.FindStringSubmatch(line); m != nil {
				cubeAnal.DoublePass = parseFloat(m[2])
				continue
			}
			if m := reDoublTake.FindStringSubmatch(line); m != nil {
				cubeAnal.DoubleTake = parseFloat(m[2])
				continue
			}
			if m := reProperCube.FindStringSubmatch(line); m != nil {
				cubeAnal.ProperAction = m[1]
				inCubeAnal = false
				continue
			}
		}

		// Move analysis (Rolled line)
		if m := reRolled.FindStringSubmatch(line); m != nil {
			inMoveAnal = true
			d1, _ := strconv.Atoi(m[1])
			d2, _ := strconv.Atoi(m[2])
			moveAnal = &MoveAnalysis{
				Dice:         [2]int{d1, d2},
				EquityChange: parseFloat(m[3]),
			}
			lastAlt = nil
			continue
		}

		// Cannot move (in move analysis)
		if inMoveAnal && reCannotMove.MatchString(line) {
			// No alternatives for cannot-move
			continue
		}

		// Alternative lines (chosen = starred)
		if inMoveAnal {
			if m := reAltChosen.FindStringSubmatch(line); m != nil {
				rank, _ := strconv.Atoi(m[1])
				alt := Alternative{
					Rank:     rank,
					Ply:      m[2],
					Move:     strings.TrimSpace(m[3]),
					Equity:   parseFloat(m[4]),
					Diff:     parseFloat(m[5]),
					IsChosen: true,
				}
				moveAnal.Alternatives = append(moveAnal.Alternatives, alt)
				lastAlt = &moveAnal.Alternatives[len(moveAnal.Alternatives)-1]
				continue
			}
			if m := reAltOther.FindStringSubmatch(line); m != nil {
				rank, _ := strconv.Atoi(m[1])
				alt := Alternative{
					Rank:   rank,
					Ply:    m[2],
					Move:   strings.TrimSpace(m[3]),
					Equity: parseFloat(m[4]),
					Diff:   parseFloat(m[5]),
				}
				moveAnal.Alternatives = append(moveAnal.Alternatives, alt)
				lastAlt = &moveAnal.Alternatives[len(moveAnal.Alternatives)-1]
				continue
			}
			// Probability line (follows an alternative)
			if lastAlt != nil {
				if m := reProbs.FindStringSubmatch(line); m != nil {
					lastAlt.Win = parseFloat(m[1])
					lastAlt.WinG = parseFloat(m[2])
					lastAlt.WinBG = parseFloat(m[3])
					lastAlt.Lose = parseFloat(m[4])
					lastAlt.LoseG = parseFloat(m[5])
					lastAlt.LoseBG = parseFloat(m[6])
					lastAlt = nil
					continue
				}
			}
		}
	}

	flushMove()

	// Handle stats at end of file
	if inGameStats && statsLines != nil {
		gameStats = parseStatBlock(statsLines)
	}
	if inMatchStats && statsLines != nil {
		matchStats = parseStatBlock(statsLines)
	}

	return game, gameStats, matchStats, nil
}

func parseStatBlock(lines []string) *StatBlock {
	sb := &StatBlock{}

	get := func(label string) (string, string) {
		for _, line := range lines {
			if strings.HasPrefix(line, label) {
				rest := line[len(label):]
				return parseTwoColumns(rest)
			}
		}
		return "", ""
	}

	getInt := func(label string) (int, int) {
		a, b := get(label)
		v1, _ := strconv.Atoi(strings.TrimSpace(a))
		v2, _ := strconv.Atoi(strings.TrimSpace(b))
		return v1, v2
	}

	getMWC := func(label string) (float64, float64) {
		for _, line := range lines {
			if strings.HasPrefix(line, label) {
				return extractMWCPair(line[len(label):])
			}
		}
		return 0, 0
	}

	getRating := func(label string) (string, string) {
		a, b := get(label)
		return strings.TrimSpace(a), strings.TrimSpace(b)
	}

	// Checkerplay
	sb.Checkerplay[0].TotalMoves, sb.Checkerplay[1].TotalMoves = getInt("Total moves")
	sb.Checkerplay[0].UnforcedMoves, sb.Checkerplay[1].UnforcedMoves = getInt("Unforced moves")
	sb.Checkerplay[0].MovesDoubtful, sb.Checkerplay[1].MovesDoubtful = getInt("Moves marked doubtful")
	sb.Checkerplay[0].MovesBad, sb.Checkerplay[1].MovesBad = getInt("Moves marked bad")
	sb.Checkerplay[0].MovesVeryBad, sb.Checkerplay[1].MovesVeryBad = getInt("Moves marked very bad")
	sb.Checkerplay[0].ErrorRateMWC, sb.Checkerplay[1].ErrorRateMWC = getMWC("Error rate mEMG (MWC)")
	sb.Checkerplay[0].Rating, sb.Checkerplay[1].Rating = getRating("Chequerplay rating")

	// Luck
	sb.Luck[0].VeryLucky, sb.Luck[1].VeryLucky = getInt("Rolls marked very lucky")
	sb.Luck[0].Lucky, sb.Luck[1].Lucky = getInt("Rolls marked lucky")
	sb.Luck[0].Unlucky, sb.Luck[1].Unlucky = getInt("Rolls marked unlucky")
	sb.Luck[0].VeryUnlucky, sb.Luck[1].VeryUnlucky = getInt("Rolls marked very unlucky")
	sb.Luck[0].TotalMWC, sb.Luck[1].TotalMWC = getMWC("Luck total EMG (MWC)")
	sb.Luck[0].Rating, sb.Luck[1].Rating = getRating("Luck rating")

	// Cube — we need to find the right "Error rate" and "rating" lines in the cube section
	// The stats file has multiple sections with the same labels. We need to track which section we're in.
	sb.Cube[0].TotalDecisions, sb.Cube[1].TotalDecisions = getInt("Total cube decisions")
	sb.Cube[0].CloseOrActual, sb.Cube[1].CloseOrActual = getInt("Close or actual cube decisions")
	sb.Cube[0].Doubles, sb.Cube[1].Doubles = getInt("Doubles")
	sb.Cube[0].Takes, sb.Cube[1].Takes = getInt("Takes")
	sb.Cube[0].Passes, sb.Cube[1].Passes = getInt("Passes")

	// For cube error rate and rating, we need section-aware parsing
	parseCubeSection(lines, sb)

	// Overall
	parseOverallSection(lines, sb)

	return sb
}

func parseCubeSection(lines []string, sb *StatBlock) {
	inCube := false
	for _, line := range lines {
		if strings.HasPrefix(line, "Cube statistics") {
			inCube = true
			continue
		}
		if strings.HasPrefix(line, "Overall statistics") {
			break
		}
		if !inCube {
			continue
		}
		if strings.HasPrefix(line, "Error rate mEMG (MWC)") {
			sb.Cube[0].ErrorRateMWC, sb.Cube[1].ErrorRateMWC = extractMWCPair(line[len("Error rate mEMG (MWC)"):])
		}
		if strings.HasPrefix(line, "Cube decision rating") {
			a, b := parseTwoColumns(line[len("Cube decision rating"):])
			sb.Cube[0].Rating = strings.TrimSpace(a)
			sb.Cube[1].Rating = strings.TrimSpace(b)
		}
	}
}

func parseOverallSection(lines []string, sb *StatBlock) {
	inOverall := false
	for _, line := range lines {
		if strings.HasPrefix(line, "Overall statistics") {
			inOverall = true
			continue
		}
		if !inOverall {
			continue
		}

		if strings.HasPrefix(line, "Error rate mEMG (MWC)") {
			sb.Overall[0].ErrorRateMWC, sb.Overall[1].ErrorRateMWC = extractMWCPair(line[len("Error rate mEMG (MWC)"):])
		}
		if strings.HasPrefix(line, "Snowie error rate") {
			// Format: "...  -8.6   ( +0.000%)      -12.1   ( +0.000%)"
			// Strip parenthesized values first, then extract the two primary floats
			cleaned := regexp.MustCompile(`\([^)]*\)`).ReplaceAllString(line[len("Snowie error rate"):], "")
			floats := regexp.MustCompile(`[+-]?\d+\.\d+`).FindAllString(cleaned, -1)
			if len(floats) >= 1 {
				sb.Overall[0].SnowieErrorRate = parseFloat(floats[0])
			}
			if len(floats) >= 2 {
				sb.Overall[1].SnowieErrorRate = parseFloat(floats[1])
			}
		}
		if strings.HasPrefix(line, "Overall rating") {
			a, b := parseTwoColumns(line[len("Overall rating"):])
			sb.Overall[0].Rating = strings.TrimSpace(a)
			sb.Overall[1].Rating = strings.TrimSpace(b)
		}
		if strings.HasPrefix(line, "Actual result") {
			a, b := parseTwoColumns(line[len("Actual result"):])
			sb.Overall[0].ActualResult = strings.TrimSpace(a)
			sb.Overall[1].ActualResult = strings.TrimSpace(b)
		}
		if strings.HasPrefix(line, "Luck adjusted result") {
			a, b := parseTwoColumns(line[len("Luck adjusted result"):])
			sb.Overall[0].LuckAdjustedResult = strings.TrimSpace(a)
			sb.Overall[1].LuckAdjustedResult = strings.TrimSpace(b)
		}
		if strings.HasPrefix(line, "Error based abs. FIBS rating") {
			a, b := parseTwoColumns(line[len("Error based abs. FIBS rating"):])
			sb.Overall[0].FIBSRating = extractFirstFloat(a)
			sb.Overall[1].FIBSRating = extractFirstFloat(b)
		}
	}
}

// parseTwoColumns splits a fixed-width two-column line into left and right values.
// gnubg uses roughly 24-char wide columns starting after the label.
func parseTwoColumns(rest string) (string, string) {
	// The two values are roughly in columns. They're separated by significant whitespace.
	// Typical format: "           value1                value2                 "
	rest = strings.TrimLeft(rest, " ")
	if rest == "" {
		return "", ""
	}

	// Find the boundary: look for a run of 2+ spaces
	parts := regexp.MustCompile(`\s{2,}`).Split(rest, -1)
	if len(parts) >= 2 {
		return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
	}
	return strings.TrimSpace(rest), ""
}

// extractMWCPair extracts two MWC percentages from a line like:
// "       -41.3   ( -0.320%)      -31.3   ( -0.242%)"
var reMWCPercent = regexp.MustCompile(`\(\s*([+-]?\d+\.\d+)%\)`)

func extractMWCPair(s string) (float64, float64) {
	matches := reMWCPercent.FindAllStringSubmatch(s, -1)
	var v1, v2 float64
	if len(matches) >= 1 {
		v1 = parseFloat(matches[0][1])
	}
	if len(matches) >= 2 {
		v2 = parseFloat(matches[1][1])
	}
	return v1, v2
}

func extractFirstFloat(s string) float64 {
	s = strings.TrimSpace(s)
	re := regexp.MustCompile(`[+-]?\d+\.\d+`)
	m := re.FindString(s)
	if m == "" {
		return 0
	}
	return parseFloat(m)
}

func parseFloat(s string) float64 {
	s = strings.TrimSpace(s)
	// Remove leading + sign for strconv
	v, _ := strconv.ParseFloat(s, 64)
	return v
}
