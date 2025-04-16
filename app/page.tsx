"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence, useAnimation } from "framer-motion"
import { RotateCcw, HelpCircle, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"

// Card types and deck setup
type Suit = "hearts" | "diamonds" | "clubs" | "spades"
type CardValue = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A"
type Card = {
  suit: Suit
  value: CardValue
  color: string
}

const createDeck = (): Card[] => {
  const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"]
  const values: CardValue[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
  const deck: Card[] = []

  for (const suit of suits) {
    for (const value of values) {
      deck.push({
        suit,
        value,
        color: suit === "hearts" || suit === "diamonds" ? "red" : "black",
      })
    }
  }

  return deck
}

// Game stages
type GameStage = "redOrBlack" | "higherOrLower" | "insideOrOutside" | "guessSuit" | "rideTheBus" | "gameOver"

export default function RideTheBusGame() {
  const [deck, setDeck] = useState<Card[]>([])
  const [currentCard, setCurrentCard] = useState<Card | null>(null)
  const [previousCard, setPreviousCard] = useState<Card | null>(null)
  const [gameStage, setGameStage] = useState<GameStage>("redOrBlack")
  const [cardsRevealed, setCardsRevealed] = useState<Card[]>([])
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [score, setScore] = useState(0)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showGameOver, setShowGameOver] = useState(false)
  const [isDealing, setIsDealing] = useState(false)
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const controls = useAnimation()

  // Initialize the game
  useEffect(() => {
    resetGame()
  }, [])

  const resetGame = () => {
    const newDeck = createDeck()
    shuffleDeck(newDeck)
    setDeck(newDeck)
    setCurrentCard(null)
    setPreviousCard(null)
    setCardsRevealed([])
    setGameStage("redOrBlack")
    setScore(0)
    setConsecutiveCorrect(0)
    setShowGameOver(false)
  }

  const shuffleDeck = (deckToShuffle: Card[]) => {
    for (let i = deckToShuffle.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deckToShuffle[i], deckToShuffle[j]] = [deckToShuffle[j], deckToShuffle[i]]
    }
  }

  const drawCard = () => {
    if (deck.length === 0) return null

    setIsDealing(true)

    const newDeck = [...deck]
    const drawnCard = newDeck.pop()!

    setPreviousCard(currentCard)
    setCurrentCard(drawnCard)
    setDeck(newDeck)
    setCardsRevealed([...cardsRevealed, drawnCard])

    setTimeout(() => {
      setIsDealing(false)
    }, 500)

    return drawnCard
  }

  const makeGuess = (guess: string) => {
    if (isDealing) return

    const card = drawCard()
    if (!card) return

    let correct = false

    switch (gameStage) {
      case "redOrBlack":
        correct =
          (guess === "red" && (card.suit === "hearts" || card.suit === "diamonds")) ||
          (guess === "black" && (card.suit === "clubs" || card.suit === "spades"))
        break
      case "higherOrLower":
        if (!previousCard) break
        const prevValue = getCardNumericValue(previousCard)
        const currValue = getCardNumericValue(card)
        correct =
          (guess === "higher" && currValue > prevValue) ||
          (guess === "lower" && currValue < prevValue) ||
          currValue === prevValue // Tie is correct
        break
      case "insideOrOutside":
        if (cardsRevealed.length < 2) break
        const firstValue = getCardNumericValue(cardsRevealed[0])
        const secondValue = getCardNumericValue(cardsRevealed[1])
        const currentValue = getCardNumericValue(card)
        const min = Math.min(firstValue, secondValue)
        const max = Math.max(firstValue, secondValue)
        correct =
          (guess === "inside" && currentValue > min && currentValue < max) ||
          (guess === "outside" && (currentValue < min || currentValue > max)) ||
          currentValue === min ||
          currentValue === max // On the boundary is correct
        break
      case "guessSuit":
        correct = card.suit === guess
        break
      case "rideTheBus":
        // In the final stage, player needs to guess correctly to finish
        const suitGuess = guess.split("-")[0]
        const valueGuess = guess.split("-")[1]

        correct =
          suitGuess === card.suit &&
          (valueGuess === "high" ? getCardNumericValue(card) > 7 : getCardNumericValue(card) <= 7)

        if (correct) {
          // Game completed successfully!
          setTimeout(() => {
            setShowGameOver(true)
          }, 1000)
        }
        break
    }

    setIsCorrect(correct)

    if (correct) {
      // Move to next stage if correct
      const newConsecutive = consecutiveCorrect + 1
      setConsecutiveCorrect(newConsecutive)
      setScore(
        score +
          (gameStage === "guessSuit"
            ? 40
            : gameStage === "insideOrOutside"
              ? 30
              : gameStage === "higherOrLower"
                ? 20
                : 10) *
            (newConsecutive > 1 ? newConsecutive : 1),
      )

      if (gameStage === "redOrBlack") setGameStage("higherOrLower")
      else if (gameStage === "higherOrLower") setGameStage("insideOrOutside")
      else if (gameStage === "insideOrOutside") setGameStage("guessSuit")
      else if (gameStage === "guessSuit") setGameStage("rideTheBus")
    } else {
      // Reset consecutive correct counter
      setConsecutiveCorrect(0)

      if (gameStage === "rideTheBus") {
        // Game over after failing the bus ride
        setTimeout(() => {
          setShowGameOver(true)
        }, 1000)
      }
    }
  }

  const getCardNumericValue = (card: Card): number => {
    if (card.value === "A") return 14
    if (card.value === "K") return 13
    if (card.value === "Q") return 12
    if (card.value === "J") return 11
    return Number.parseInt(card.value)
  }

  const getStageTitle = (): string => {
    switch (gameStage) {
      case "redOrBlack":
        return "Red or Black?"
      case "higherOrLower":
        return "Higher or Lower?"
      case "insideOrOutside":
        return "Inside or Outside?"
      case "guessSuit":
        return "Guess the Suit"
      case "rideTheBus":
        return "Ride the Bus!"
      case "gameOver":
        return "Game Over!"
      default:
        return ""
    }
  }

  const getStageDescription = (): string => {
    switch (gameStage) {
      case "redOrBlack":
        return "Guess if the next card is red or black"
      case "higherOrLower":
        return "Guess if the next card is higher or lower than the previous"
      case "insideOrOutside":
        return "Guess if the next card is inside or outside the range of the first two cards"
      case "guessSuit":
        return "Guess the suit of the next card"
      case "rideTheBus":
        return "Final round! Guess the suit AND if it's high (8-A) or low (2-7)"
      case "gameOver":
        return "Thanks for playing!"
      default:
        return ""
    }
  }

  const renderGuessButtons = () => {
    switch (gameStage) {
      case "redOrBlack":
        return (
          <div className="grid grid-cols-2 gap-4 w-full">
            <Button
              className="h-14 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("red")}
            >
              Red
            </Button>
            <Button
              className="h-14 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl"
              onClick={() => makeGuess("black")}
            >
              Black
            </Button>
          </div>
        )
      case "higherOrLower":
        return (
          <div className="grid grid-cols-2 gap-4 w-full">
            <Button
              className="h-14 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("higher")}
            >
              Higher
            </Button>
            <Button
              className="h-14 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("lower")}
            >
              Lower
            </Button>
          </div>
        )
      case "insideOrOutside":
        return (
          <div className="grid grid-cols-2 gap-4 w-full">
            <Button
              className="h-14 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("inside")}
            >
              Inside
            </Button>
            <Button
              className="h-14 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("outside")}
            >
              Outside
            </Button>
          </div>
        )
      case "guessSuit":
        return (
          <div className="grid grid-cols-2 gap-3 w-full">
            <Button
              className="h-14 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("hearts")}
            >
              Hearts ♥
            </Button>
            <Button
              className="h-14 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("diamonds")}
            >
              Diamonds ♦
            </Button>
            <Button
              className="h-14 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl"
              onClick={() => makeGuess("clubs")}
            >
              Clubs ♣
            </Button>
            <Button
              className="h-14 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl"
              onClick={() => makeGuess("spades")}
            >
              Spades ♠
            </Button>
          </div>
        )
      case "rideTheBus":
        return (
          <div className="grid grid-cols-2 gap-3 w-full">
            <Button
              className="h-14 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("hearts-high")}
            >
              Hearts High
            </Button>
            <Button
              className="h-14 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("hearts-low")}
            >
              Hearts Low
            </Button>
            <Button
              className="h-14 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("diamonds-high")}
            >
              Diamonds High
            </Button>
            <Button
              className="h-14 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl"
              onClick={() => makeGuess("diamonds-low")}
            >
              Diamonds Low
            </Button>
            <Button
              className="h-14 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl"
              onClick={() => makeGuess("clubs-high")}
            >
              Clubs High
            </Button>
            <Button
              className="h-14 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl"
              onClick={() => makeGuess("clubs-low")}
            >
              Clubs Low
            </Button>
            <Button
              className="h-14 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl"
              onClick={() => makeGuess("spades-high")}
            >
              Spades High
            </Button>
            <Button
              className="h-14 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-xl"
              onClick={() => makeGuess("spades-low")}
            >
              Spades Low
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  const renderCardBack = () => (
    <div className="w-[120px] h-[180px] rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 border-4 border-white flex items-center justify-center shadow-lg">
      <div className="text-white text-3xl font-bold">🚌</div>
    </div>
  )

  const renderCard = (card: Card, index: number) => {
    const suitSymbol = card.suit === "hearts" ? "♥" : card.suit === "diamonds" ? "♦" : card.suit === "clubs" ? "♣" : "♠"

    const valueDisplay = card.value

    return (
      <motion.div
        key={`${card.suit}-${card.value}-${index}`}
        initial={{ rotateY: 180, opacity: 0 }}
        animate={{ rotateY: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className={`w-[120px] h-[180px] rounded-xl bg-white border-4 border-gray-200 shadow-lg flex flex-col items-center justify-between p-3 ${
          card.color === "red" ? "text-red-500" : "text-black"
        }`}
      >
        <div className="text-2xl font-bold self-start">{valueDisplay}</div>
        <div className="text-6xl">{suitSymbol}</div>
        <div className="text-2xl font-bold self-end transform rotate-180">{valueDisplay}</div>
      </motion.div>
    )
  }

  // Add pull-to-refresh functionality
  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      setIsDragging(true)
      dragStartY.current = e.touches[0].clientY
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return

    const currentY = e.touches[0].clientY
    const diff = currentY - dragStartY.current

    if (diff > 0) {
      e.preventDefault()
      controls.start({ y: diff })
    }
  }

  const handleTouchEnd = () => {
    if (isDragging) {
      controls.start({ y: 0 })
      setIsDragging(false)
      resetGame()
    }
  }

  return (
    <div 
      className="flex flex-col items-center min-h-screen bg-gradient-to-b from-pink-100 to-purple-200 p-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* iOS-style header with safe area padding */}
      <div className="w-full max-w-md bg-white rounded-t-xl px-4 py-3 flex justify-between items-center shadow-sm pt-[env(safe-area-inset-top)]">
        <Button variant="ghost" size="icon" onClick={() => setShowInstructions(true)} className="rounded-full">
          <HelpCircle className="h-6 w-6 text-pink-500" />
        </Button>
        <h1 className="text-xl font-bold text-center bg-gradient-to-r from-pink-500 to-purple-600 text-transparent bg-clip-text">
          Ride the Bus
        </h1>
        <Button variant="ghost" size="icon" onClick={resetGame} className="rounded-full">
          <RotateCcw className="h-6 w-6 text-pink-500" />
        </Button>
      </div>

      {/* Game container with safe area padding */}
      <div className="w-full max-w-md bg-white rounded-b-xl shadow-lg p-6 flex flex-col items-center gap-6 pb-[env(safe-area-inset-bottom)]">
        {/* Game stage */}
        <div className="text-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 text-transparent bg-clip-text">
            {getStageTitle()}
          </h2>
          <p className="text-gray-600">{getStageDescription()}</p>
        </div>

        {/* Score counter */}
        <div className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-full px-6 py-2 text-center shadow-md">
          <span className="text-pink-800 font-bold flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Score: {score}
            {consecutiveCorrect > 1 && (
              <span className="text-xs bg-pink-500 text-white px-2 py-0.5 rounded-full">
                {consecutiveCorrect}x Combo!
              </span>
            )}
          </span>
        </div>

        {/* Updated card display with touch-friendly sizing */}
        <div className="flex flex-col items-center justify-center gap-6 my-4">
          <div className="relative w-[140px] h-[210px] sm:w-[120px] sm:h-[180px]">
            {currentCard ? renderCard(currentCard, cardsRevealed.length - 1) : renderCardBack()}
          </div>

          {previousCard && gameStage !== "redOrBlack" && (
            <div className="relative -mt-4 scale-75 opacity-70 w-[140px] h-[210px] sm:w-[120px] sm:h-[180px]">
              {renderCard(previousCard, cardsRevealed.length - 2)}
            </div>
          )}

          {deck.length > 0 && (
            <div className="relative mt-2 scale-75 opacity-80 w-[140px] h-[210px] sm:w-[120px] sm:h-[180px]">
              {renderCardBack()}
              <div className="absolute top-1 right-1 bg-pink-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center shadow-md">
                {deck.length}
              </div>
            </div>
          )}
        </div>

        {/* Feedback message */}
        <AnimatePresence>
          {isCorrect !== null && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`text-center font-bold text-lg ${isCorrect ? "text-green-500" : "text-red-500"}`}
            >
              {isCorrect ? "Correct! 🎉" : "Wrong! 😅"}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Updated buttons with touch-friendly sizing */}
        <div className="w-full grid grid-cols-2 gap-4">
          {renderGuessButtons()}
        </div>

        {/* Pull-to-refresh indicator */}
        <motion.div
          animate={controls}
          className="absolute top-0 left-0 right-0 h-16 flex items-center justify-center bg-gradient-to-b from-pink-100 to-transparent"
        >
          <motion.div
            animate={{ rotate: isDragging ? 180 : 0 }}
            className="text-pink-500"
          >
            <RotateCcw className="h-6 w-6" />
          </motion.div>
        </motion.div>
      </div>

      {/* Instructions modal */}
      <Dialog open={showInstructions} onOpenChange={setShowInstructions}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl bg-gradient-to-r from-pink-500 to-purple-600 text-transparent bg-clip-text">
              How to Play Ride the Bus
            </DialogTitle>
            <DialogDescription>
              <div className="mt-4 space-y-3 text-left">
                <p className="font-bold text-pink-600">Round 1: Red or Black</p>
                <p>Guess if the next card is red or black. If correct, move to the next round.</p>

                <p className="font-bold text-pink-600">Round 2: Higher or Lower</p>
                <p>Guess if the next card is higher or lower than the previous card.</p>

                <p className="font-bold text-pink-600">Round 3: Inside or Outside</p>
                <p>Guess if the next card is inside or outside the range of the first two cards.</p>

                <p className="font-bold text-pink-600">Round 4: Guess the Suit</p>
                <p>Guess the suit of the next card (hearts, diamonds, clubs, or spades).</p>

                <p className="font-bold text-pink-600">Final Round: Ride the Bus</p>
                <p>Guess both the suit AND whether the card is high (8-A) or low (2-7).</p>

                <p className="font-bold text-purple-600">Scoring:</p>
                <p>Round 1: 10 points</p>
                <p>Round 2: 20 points</p>
                <p>Round 3: 30 points</p>
                <p>Round 4: 40 points</p>
                <p>Consecutive correct guesses multiply your score!</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 rounded-xl">
              Got it!
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>

      {/* Game over modal */}
      <Dialog open={showGameOver} onOpenChange={setShowGameOver}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl bg-gradient-to-r from-pink-500 to-purple-600 text-transparent bg-clip-text">
              Game Over!
            </DialogTitle>
            <DialogDescription>
              <div className="mt-4 space-y-3 text-center">
                <p className="text-lg">
                  Your final score: <span className="font-bold text-pink-600">{score}</span> points!
                </p>
                <p>Thanks for playing Ride the Bus!</p>

                <div className="py-4">
                  <motion.div
                    animate={{
                      x: [0, 20, -20, 20, -20, 0],
                      rotate: [0, 5, -5, 5, -5, 0],
                    }}
                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
                    className="text-6xl text-center"
                  >
                    🚌
                  </motion.div>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button
              className="w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 rounded-xl"
              onClick={resetGame}
            >
              Play Again
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  )
}
