package gnubg

type MatchData struct {
	Player1, Player2 string
	MatchLength      int
	Games            []Game
	MatchStats       *StatBlock
}

type Game struct {
	GameNumber  int
	ScoreBefore [2]int // [player1, player2]
	Moves       []Move
	Winner      string
	PointsWon   int
	Stats       *StatBlock
}

type Move struct {
	Number       int
	Player       string
	Type         string // "checker", "cube_decision", "double", "take", "reject", "cannot_move"
	Dice         [2]int
	PositionID   string
	MatchID      string
	Action       string // "8/4 6/4", "doubles", "rejects", etc.
	PipCounts    [2]int
	Alerts       []string
	CubeAnalysis *CubeAnalysis
	MoveAnalysis *MoveAnalysis
}

type CubeAnalysis struct {
	CubelessEquity float64
	NoDouble       float64
	DoublePass     float64
	DoubleTake     float64
	ProperAction   string
}

type MoveAnalysis struct {
	Dice         [2]int
	EquityChange float64
	Alternatives []Alternative
	ChosenRank   int
}

type Alternative struct {
	Rank                         int
	Ply                          string
	Move                         string
	Equity                       float64
	Diff                         float64
	IsChosen                     bool
	Win, WinG, WinBG             float64
	Lose, LoseG, LoseBG         float64
}

type StatBlock struct {
	Checkerplay [2]CheckerplayStats
	Luck        [2]LuckStats
	Cube        [2]CubeStats
	Overall     [2]OverallStats
}

type CheckerplayStats struct {
	TotalMoves, UnforcedMoves              int
	MovesDoubtful, MovesBad, MovesVeryBad  int
	ErrorRateMWC                           float64
	Rating                                 string
}

type LuckStats struct {
	VeryLucky, Lucky, Unlucky, VeryUnlucky int
	TotalMWC                               float64
	Rating                                 string
}

type CubeStats struct {
	TotalDecisions, CloseOrActual, Doubles, Takes, Passes int
	ErrorRateMWC                                          float64
	Rating                                                string
}

type OverallStats struct {
	ErrorRateMWC       float64
	SnowieErrorRate    float64
	Rating             string
	ActualResult       string
	LuckAdjustedResult string
	FIBSRating         float64
}
