package gnubg

import (
	"math"
	"testing"
)

const fixtureDir = "../testdata/heroes-analysis"

func approx(a, b float64) bool {
	return math.Abs(a-b) < 0.002
}

func TestParseMatchFiles(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	if md.Player1 != "rchoice" {
		t.Errorf("Player1 = %q, want %q", md.Player1, "rchoice")
	}
	if md.Player2 != "A192K" {
		t.Errorf("Player2 = %q, want %q", md.Player2, "A192K")
	}
	if md.MatchLength != 5 {
		t.Errorf("MatchLength = %d, want 5", md.MatchLength)
	}
	if len(md.Games) != 5 {
		t.Fatalf("Games count = %d, want 5", len(md.Games))
	}
	if md.Games[0].GameNumber != 1 {
		t.Errorf("Game 1 number = %d", md.Games[0].GameNumber)
	}
	if md.Games[4].GameNumber != 5 {
		t.Errorf("Game 5 number = %d", md.Games[4].GameNumber)
	}
}

func TestParseScoreBefore(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	// Game 1: 0-0
	if md.Games[0].ScoreBefore != [2]int{0, 0} {
		t.Errorf("Game 1 ScoreBefore = %v", md.Games[0].ScoreBefore)
	}
	// Game 2: 1-0
	if md.Games[1].ScoreBefore != [2]int{1, 0} {
		t.Errorf("Game 2 ScoreBefore = %v", md.Games[1].ScoreBefore)
	}
}

func TestParseGame1Moves(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	g1 := md.Games[0]

	// Game 1 has 14 move entries (moves 1-12 + cube decision move 13 + double move 14)
	if len(g1.Moves) < 12 {
		t.Fatalf("Game 1 move count = %d, want >= 12", len(g1.Moves))
	}

	// Move 1: rchoice plays 42, 8/4 6/4
	m1 := g1.Moves[0]
	if m1.Number != 1 {
		t.Errorf("Move 1 Number = %d", m1.Number)
	}
	if m1.Player != "rchoice" {
		t.Errorf("Move 1 Player = %q", m1.Player)
	}
	if m1.Dice != [2]int{4, 2} {
		t.Errorf("Move 1 Dice = %v", m1.Dice)
	}
	if m1.Action != "8/4 6/4" {
		t.Errorf("Move 1 Action = %q", m1.Action)
	}
	if m1.PositionID != "4HPwATDgc/ABMA" {
		t.Errorf("Move 1 PositionID = %q", m1.PositionID)
	}
	if m1.PipCounts != [2]int{167, 167} {
		t.Errorf("Move 1 PipCounts = %v", m1.PipCounts)
	}

	// Move 5 (bar/17*): rchoice, has alerts
	m5 := g1.Moves[4]
	if m5.Action != "bar/17*" {
		t.Errorf("Move 5 Action = %q, want %q", m5.Action, "bar/17*")
	}
	if len(m5.Alerts) == 0 {
		t.Error("Move 5 expected alerts")
	}

	// Game result
	if g1.Winner != "rchoice" {
		t.Errorf("Game 1 Winner = %q, want %q", g1.Winner, "rchoice")
	}
	if g1.PointsWon != 1 {
		t.Errorf("Game 1 PointsWon = %d, want 1", g1.PointsWon)
	}
}

func TestParseMoveAlternatives(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	// Move 1, game 1: chosen rank 1
	m1 := md.Games[0].Moves[0]
	if m1.MoveAnalysis == nil {
		t.Fatal("Move 1 MoveAnalysis is nil")
	}
	if m1.MoveAnalysis.ChosenRank != 1 {
		t.Errorf("Move 1 ChosenRank = %d, want 1", m1.MoveAnalysis.ChosenRank)
	}
	if len(m1.MoveAnalysis.Alternatives) != 5 {
		t.Errorf("Move 1 alt count = %d, want 5", len(m1.MoveAnalysis.Alternatives))
	}
	if !m1.MoveAnalysis.Alternatives[0].IsChosen {
		t.Error("Move 1 alt 0 should be chosen")
	}
	if !approx(m1.MoveAnalysis.Alternatives[0].Equity, 0.160) {
		t.Errorf("Move 1 alt 0 equity = %f", m1.MoveAnalysis.Alternatives[0].Equity)
	}
	// Check probabilities
	alt0 := m1.MoveAnalysis.Alternatives[0]
	if !approx(alt0.Win, 0.536) {
		t.Errorf("Move 1 alt 0 Win = %f, want 0.536", alt0.Win)
	}

	// Move 8, game 1: A192K plays 22, chosen rank is 10 (very bad move)
	m8 := md.Games[0].Moves[7]
	if m8.MoveAnalysis == nil {
		t.Fatal("Move 8 MoveAnalysis is nil")
	}
	if m8.MoveAnalysis.ChosenRank != 8 {
		t.Errorf("Move 8 ChosenRank = %d, want 8", m8.MoveAnalysis.ChosenRank)
	}
	// Verify there are multiple alternatives listed
	if len(m8.MoveAnalysis.Alternatives) < 5 {
		t.Errorf("Move 8 alt count = %d, want >= 5", len(m8.MoveAnalysis.Alternatives))
	}
}

func TestParseCubeAnalysis(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	// Move 2, game 1: A192K has cube analysis
	m2 := md.Games[0].Moves[1]
	if m2.CubeAnalysis == nil {
		t.Fatal("Move 2 CubeAnalysis is nil")
	}
	ca := m2.CubeAnalysis
	if !approx(ca.CubelessEquity, -0.113) {
		t.Errorf("CubelessEquity = %f, want -0.113", ca.CubelessEquity)
	}
	if !approx(ca.NoDouble, -0.161) {
		t.Errorf("NoDouble = %f, want -0.161", ca.NoDouble)
	}
	if !approx(ca.DoublePass, 1.000) {
		t.Errorf("DoublePass = %f, want 1.000", ca.DoublePass)
	}
	if !approx(ca.DoubleTake, -0.623) {
		t.Errorf("DoubleTake = %f, want -0.623", ca.DoubleTake)
	}
	if ca.ProperAction != "No double, take (28.5%)" {
		t.Errorf("ProperAction = %q", ca.ProperAction)
	}
}

func TestParseCannotMove(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	// Move 6, game 1: A192K cannot move
	m6 := md.Games[0].Moves[5]
	if m6.Type != "cannot_move" {
		t.Errorf("Move 6 Type = %q, want %q", m6.Type, "cannot_move")
	}
	if m6.Action != "cannot move" {
		t.Errorf("Move 6 Action = %q", m6.Action)
	}
	if m6.Player != "A192K" {
		t.Errorf("Move 6 Player = %q", m6.Player)
	}
}

func TestParseCubeDecisionAndDouble(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	g1 := md.Games[0]
	// cube_decision is merged into the double — no separate cube_decision move
	var doubleMove, rejectMove *Move
	for i := range g1.Moves {
		m := &g1.Moves[i]
		if m.Number == 13 && m.Type == "cube_decision" {
			t.Error("cube_decision move should not exist (merged into double)")
		}
		if m.Type == "double" && m.Number == 14 {
			doubleMove = m
		}
		if m.Type == "reject" && m.Number == 14 {
			rejectMove = m
		}
	}

	if doubleMove == nil {
		t.Fatal("Double move not found")
	}
	// Double should have CubeAnalysis from the merged cube_decision
	if doubleMove.CubeAnalysis == nil {
		t.Error("Double move should have CubeAnalysis (merged from cube_decision)")
	}

	if rejectMove == nil {
		t.Fatal("Reject move not found")
	}
	if rejectMove.Action != "rejects" {
		t.Errorf("Reject action = %q", rejectMove.Action)
	}
	// Reject should carry forward PositionID from the double
	if rejectMove.PositionID == "" {
		t.Error("Reject move should have PositionID carried from double")
	}
}

func TestParseGameStats(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	stats := md.Games[0].Stats
	if stats == nil {
		t.Fatal("Game 1 Stats is nil")
	}

	// Checkerplay
	if stats.Checkerplay[0].TotalMoves != 6 {
		t.Errorf("Checkerplay[0].TotalMoves = %d, want 6", stats.Checkerplay[0].TotalMoves)
	}
	if stats.Checkerplay[1].TotalMoves != 6 {
		t.Errorf("Checkerplay[1].TotalMoves = %d, want 6", stats.Checkerplay[1].TotalMoves)
	}
	if stats.Checkerplay[0].UnforcedMoves != 6 {
		t.Errorf("Checkerplay[0].UnforcedMoves = %d, want 6", stats.Checkerplay[0].UnforcedMoves)
	}
	if stats.Checkerplay[0].MovesVeryBad != 1 {
		t.Errorf("Checkerplay[0].MovesVeryBad = %d, want 1", stats.Checkerplay[0].MovesVeryBad)
	}
	if stats.Checkerplay[0].Rating != "Awful!" {
		t.Errorf("Checkerplay[0].Rating = %q, want %q", stats.Checkerplay[0].Rating, "Awful!")
	}

	// Luck
	if stats.Luck[0].Lucky != 2 {
		t.Errorf("Luck[0].Lucky = %d, want 2", stats.Luck[0].Lucky)
	}

	// Cube
	if stats.Cube[0].TotalDecisions != 6 {
		t.Errorf("Cube[0].TotalDecisions = %d, want 6", stats.Cube[0].TotalDecisions)
	}
	if stats.Cube[0].CloseOrActual != 3 {
		t.Errorf("Cube[0].CloseOrActual = %d, want 3", stats.Cube[0].CloseOrActual)
	}
	if stats.Cube[1].CloseOrActual != 1 {
		t.Errorf("Cube[1].CloseOrActual = %d, want 1", stats.Cube[1].CloseOrActual)
	}
	if stats.Cube[0].Doubles != 1 {
		t.Errorf("Cube[0].Doubles = %d, want 1", stats.Cube[0].Doubles)
	}

	// Overall
	if stats.Overall[0].Rating != "Awful!" {
		t.Errorf("Overall[0].Rating = %q, want %q", stats.Overall[0].Rating, "Awful!")
	}
	if !approx(stats.Overall[0].FIBSRating, 1436.0) {
		t.Errorf("Overall[0].FIBSRating = %f, want 1436.0", stats.Overall[0].FIBSRating)
	}
	if !approx(stats.Overall[1].FIBSRating, 1153.9) {
		t.Errorf("Overall[1].FIBSRating = %f, want 1153.9", stats.Overall[1].FIBSRating)
	}
}

func TestParseMatchStats(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	if md.MatchStats == nil {
		t.Fatal("MatchStats is nil")
	}

	ms := md.MatchStats

	// Checkerplay
	if ms.Checkerplay[0].TotalMoves != 94 {
		t.Errorf("Match Checkerplay[0].TotalMoves = %d, want 94", ms.Checkerplay[0].TotalMoves)
	}
	if ms.Checkerplay[1].TotalMoves != 95 {
		t.Errorf("Match Checkerplay[1].TotalMoves = %d, want 95", ms.Checkerplay[1].TotalMoves)
	}
	if ms.Checkerplay[0].Rating != "Intermediate" {
		t.Errorf("Match Checkerplay[0].Rating = %q, want %q", ms.Checkerplay[0].Rating, "Intermediate")
	}

	// Overall
	if ms.Overall[0].Rating != "Casual player" {
		t.Errorf("Match Overall[0].Rating = %q, want %q", ms.Overall[0].Rating, "Casual player")
	}
	if !approx(ms.Overall[0].FIBSRating, 1794.2) {
		t.Errorf("Match Overall[0].FIBSRating = %f, want 1794.2", ms.Overall[0].FIBSRating)
	}
	if !approx(ms.Overall[1].FIBSRating, 1663.3) {
		t.Errorf("Match Overall[1].FIBSRating = %f, want 1663.3", ms.Overall[1].FIBSRating)
	}

	// Snowie error rates (both players)
	if !approx(ms.Overall[0].SnowieErrorRate, -9.3) {
		t.Errorf("Match Overall[0].SnowieErrorRate = %f, want -9.3", ms.Overall[0].SnowieErrorRate)
	}
	if !approx(ms.Overall[1].SnowieErrorRate, -12.7) {
		t.Errorf("Match Overall[1].SnowieErrorRate = %f, want -12.7", ms.Overall[1].SnowieErrorRate)
	}
}

func TestParseGame5Winner(t *testing.T) {
	md, err := ParseMatchFiles(fixtureDir)
	if err != nil {
		t.Fatalf("ParseMatchFiles: %v", err)
	}

	g5 := md.Games[4]
	if g5.Winner != "A192K" {
		t.Errorf("Game 5 Winner = %q, want %q", g5.Winner, "A192K")
	}
	if g5.PointsWon != 4 {
		t.Errorf("Game 5 PointsWon = %d, want 4", g5.PointsWon)
	}
}
