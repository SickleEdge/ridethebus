"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence, useAnimation } from "framer-motion"
import { RotateCcw, HelpCircle, Trophy, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { useRouter } from "next/navigation"

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
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [deck, setDeck] = useState<Card[]>([])
  const [currentCard, setCurrentCard] = useState<Card | null>(null)
  const [cardHistory, setCardHistory] = useState<Card[]>([])
  const [gameStage, setGameStage] = useState<GameStage>("redOrBlack")
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [score, setScore] = useState(0)
  const [showInstructions, setShowInstructions] = useState(false)
  const [showGameOver, setShowGameOver] = useState(false)
  const [isDealing, setIsDealing] = useState(false)
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0)
  const [showFeedback, setShowFeedback] = useState(false)
  const [hasWon, setHasWon] = useState(false)
  const [isMultiplayer, setIsMultiplayer] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [players, setPlayers] = useState<{ name: string; score: number }[]>([])
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [isGameStarted, setIsGameStarted] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)

  useEffect(() => {
    setMounted(true)
    resetGame()
  }, [])

  const resetGame = () => {
    const newDeck = createDeck()
    shuffleDeck(newDeck)
    // Take only the first 4 cards
    const gameDeck = newDeck.slice(0, 4)
    setDeck(gameDeck)
    setCurrentCard(null)
    setCardHistory([])
    setGameStage("redOrBlack")
    setScore(0)
    setConsecutiveCorrect(0)
    setShowGameOver(false)
    setShowFeedback(false)
    setIsCorrect(null)
    setHasWon(false)
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
    const drawnCard = newDeck.shift()!

    setCurrentCard(drawnCard)
    setDeck(newDeck)

    setTimeout(() => {
      setIsDealing(false)
    }, 500)

    return drawnCard
  }

  const makeGuess = (guess: string) => {
    if (isDealing || showGameOver) return

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
        if (cardHistory.length === 0) break
        const prevCard = cardHistory[cardHistory.length - 1]
        const prevValue = getCardNumericValue(prevCard)
        const currValue = getCardNumericValue(card)
        correct =
          (guess === "higher" && currValue > prevValue) ||
          (guess === "lower" && currValue < prevValue) ||
          currValue === prevValue // Tie is correct
        break
      case "insideOrOutside":
        if (cardHistory.length < 2) break
        const firstValue = getCardNumericValue(cardHistory[0])
        const secondValue = getCardNumericValue(cardHistory[1])
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
    }

    setIsCorrect(correct)
    setShowFeedback(true)

    // Hide feedback after 1 second
    setTimeout(() => {
      setShowFeedback(false)
    }, 1000)

    if (correct) {
      // Add card to history and move to next stage
      setCardHistory([...cardHistory, card])
      setConsecutiveCorrect(consecutiveCorrect + 1)
      setScore(score + (gameStage === "guessSuit" ? 40 : gameStage === "insideOrOutside" ? 30 : gameStage === "higherOrLower" ? 20 : 10))

      if (gameStage === "redOrBlack") setGameStage("higherOrLower")
      else if (gameStage === "higherOrLower") setGameStage("insideOrOutside")
      else if (gameStage === "insideOrOutside") setGameStage("guessSuit")
      else if (gameStage === "guessSuit") {
        // Game completed successfully!
        setHasWon(true)
        setShowGameOver(true)
      }
    } else {
      setConsecutiveCorrect(0)
      setHasWon(false)
      // Game over immediately
      setShowGameOver(true)
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

  const renderCard = (card: Card, index: number) => {
    const suitSymbol = card.suit === "hearts" ? "♥" : card.suit === "diamonds" ? "♦" : card.suit === "clubs" ? "♣" : "♠"
    const valueDisplay = card.value

    return (
      <motion.div
        key={`${card.suit}-${card.value}-${index}`}
        initial={{ rotateY: 180, opacity: 0, scale: 0.8 }}
        animate={{ 
          rotateY: 0, 
          opacity: 1, 
          scale: 1,
          transition: {
            type: "spring",
            stiffness: 300,
            damping: 20,
            delay: index * 0.1
          }
        }}
        whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
        className={`w-full h-full rounded-xl bg-white border-4 border-gray-200 shadow-lg flex flex-col items-center justify-between p-2 ${
          card.color === "red" ? "text-red-500" : "text-black"
        }`}
      >
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xl font-bold self-start"
        >
          {valueDisplay}
        </motion.div>
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ 
            type: "spring",
            stiffness: 200,
            damping: 10,
            delay: 0.4
          }}
          className="text-4xl"
        >
          {suitSymbol}
        </motion.div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-xl font-bold self-end transform rotate-180"
        >
          {valueDisplay}
        </motion.div>
      </motion.div>
    )
  }

  const renderCardBack = () => (
    <div className="w-[120px] h-[180px] rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 border-4 border-white flex items-center justify-center shadow-lg">
      <div className="text-white text-3xl font-bold">🚌</div>
    </div>
  )

  // Remove pull-to-refresh functionality since it's causing issues
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent pull-to-refresh
  }

  const renderGuessButtons = () => {
    switch (gameStage) {
      case "redOrBlack":
        return (
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button
              className="h-16 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("red")}
            >
              Red
            </Button>
            <Button
              className="h-16 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("black")}
            >
              Black
            </Button>
          </div>
        )
      case "higherOrLower":
        return (
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button
              className="h-16 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("higher")}
            >
              Higher
            </Button>
            <Button
              className="h-16 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("lower")}
            >
              Lower
            </Button>
          </div>
        )
      case "insideOrOutside":
        return (
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button
              className="h-16 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("inside")}
            >
              Inside
            </Button>
            <Button
              className="h-16 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("outside")}
            >
              Outside
            </Button>
          </div>
        )
      case "guessSuit":
        return (
          <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
            <Button
              className="h-16 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("hearts")}
            >
              ♥ Hearts
            </Button>
            <Button
              className="h-16 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("diamonds")}
            >
              ♦ Diamonds
            </Button>
            <Button
              className="h-16 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("clubs")}
            >
              ♣ Clubs
            </Button>
            <Button
              className="h-16 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black text-white font-bold text-xl rounded-xl shadow-lg transform transition-all hover:scale-105 border-2 border-white/20"
              onClick={() => makeGuess("spades")}
            >
              ♠ Spades
            </Button>
          </div>
        )
      default:
        return null
    }
  }

  const leaveRoom = () => {
    if (ws) {
      ws.close()
      setWs(null)
    }
    setIsMultiplayer(false)
    setRoomId('')
    setPlayerName('')
    setPlayers([])
    setIsHost(false)
    setIsGameStarted(false)
    setIsGameOver(false)
    setHasWon(false)
    resetGame()
  }

  if (!mounted) {
    return null
  }

  return (
    <div 
      className="flex flex-col items-center min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900"
      onTouchStart={handleTouchStart}
    >
      {/* Game container */}
      <div className="w-full max-w-md flex flex-col items-center gap-3 p-4">
        {/* Header with game info */}
        <motion.div 
          className="w-full flex justify-between items-center px-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowInstructions(true)} 
              className="rounded-full bg-white/10 hover:bg-white/20"
            >
              <HelpCircle className="h-5 w-5 text-white" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => router.push('/multiplayer')} 
              className="rounded-full bg-white/10 hover:bg-white/20"
            >
              <Users className="h-5 w-5 text-white" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            <span className="text-white font-bold">{score}</span>
            {consecutiveCorrect > 1 && (
              <span className="text-xs bg-pink-500 text-white px-2 py-0.5 rounded-full">
                {consecutiveCorrect}x
              </span>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={resetGame} 
            className="rounded-full bg-white/10 hover:bg-white/20"
          >
            <RotateCcw className="h-5 w-5 text-white" />
          </Button>
        </motion.div>

        {/* Game stage title */}
        <motion.div 
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-xl font-bold text-white">
            {getStageTitle()}
          </h2>
          <p className="text-sm text-white/70">{getStageDescription()}</p>
        </motion.div>

        {/* Card history display */}
        <motion.div 
          className="flex justify-center gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {cardHistory.map((card, index) => (
            <motion.div
              key={`${card.suit}-${card.value}-${index}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.7, x: 0 }}
              transition={{ 
                type: "spring",
                stiffness: 200,
                damping: 15,
                delay: index * 0.1
              }}
              className="relative w-[60px] h-[90px]"
            >
              {renderCard(card, index)}
            </motion.div>
          ))}
        </motion.div>

        {/* Current card display */}
        <motion.div 
          className="relative w-[100px] h-[150px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div 
            className={`relative ${showGameOver ? 'blur-[0.5px]' : ''}`}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ 
              scale: 1, 
              opacity: 1,
              transition: {
                type: "spring",
                stiffness: 300,
                damping: 20
              }
            }}
          >
            {currentCard ? renderCard(currentCard, cardHistory.length) : renderCardBack()}
          </motion.div>
          {showGameOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: 1, 
                scale: 1,
                transition: {
                  type: "spring",
                  stiffness: 300,
                  damping: 20
                }
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {hasWon ? (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ 
                    scale: 1, 
                    rotate: 0,
                    transition: {
                      type: "spring",
                      stiffness: 260,
                      damping: 20
                    }
                  }}
                  className="flex flex-col items-center gap-2"
                >
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      rotate: [0, 10, -10, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      repeatType: "reverse"
                    }}
                    className="text-6xl"
                  >
                    🎉
                  </motion.div>
                  <Button
                    className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold rounded-xl px-4 py-2 shadow-lg transform transition-all hover:scale-105"
                    onClick={resetGame}
                  >
                    Play Again
                  </Button>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Button
                    className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold rounded-xl px-4 py-2 shadow-lg transform transition-all hover:scale-105"
                    onClick={resetGame}
                  >
                    Play Again
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Feedback message */}
        <AnimatePresence>
          {showFeedback && isCorrect !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`text-center font-bold text-lg ${isCorrect ? "text-green-400" : "text-red-400"}`}
            >
              {isCorrect ? "Correct! 🎉" : "Wrong! 😅"}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game controls - Fixed at bottom */}
        {!showGameOver && (
          <div className="fixed bottom-0 left-0 right-0 flex justify-center p-4 bg-gradient-to-t from-indigo-900/80 to-transparent">
            {renderGuessButtons()}
          </div>
        )}
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
    </div>
  )
}
