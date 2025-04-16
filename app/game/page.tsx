"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"

// Track game connections separately from room list connections
let gameConnections = new Map<string, WebSocket>() // roomId:playerName -> WebSocket
let connectionAttemptsInProgress = new Set<string>() // Set of "roomId:playerName" keys
let lastConnectionAttempts = new Map<string, number>() // roomId:playerName -> timestamp
const RECONNECT_THROTTLE_MS = 5000 // Prevent reconnections within 5 seconds

interface Player {
  name: string
  score: number
}

interface GameState {
  stage: "red_black" | "higher_lower" | "inside_outside" | "suit" | null
  currentCard: { suit: string; value: number } | null
  players: Player[]
  isGameStarted: boolean
  isGameOver: boolean
  winners: string[]
}

export default function GamePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomId = searchParams.get("room")
  const playerName = searchParams.get("name")
  const connectionKey = roomId && playerName ? `${roomId}:${playerName}` : null
  const [gameState, setGameState] = useState<GameState>({
    stage: null,
    currentCard: null,
    players: [],
    isGameStarted: false,
    isGameOver: false,
    winners: []
  })
  const [error, setError] = useState<string>("")
  const [errorDetails, setErrorDetails] = useState<string>("")
  const [isConnecting, setIsConnecting] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [reconnectTimeout, setReconnectTimeout] = useState<NodeJS.Timeout | null>(null)
  const [lastActivity, setLastActivity] = useState<number>(Date.now())
  const mountedRef = useRef<boolean>(true)

  // Function to request current game state
  const refreshGameState = useCallback(() => {
    if (connectionKey && gameConnections.has(connectionKey)) {
      const ws = gameConnections.get(connectionKey)!
      if (ws.readyState === WebSocket.OPEN) {
        try {
          console.log("[GAME] Requesting current game state")
          ws.send(JSON.stringify({ type: "getState" }))
          setLastActivity(Date.now())
        } catch (err) {
          console.error("[GAME] Error requesting game state:", err)
        }
      }
    }
  }, [connectionKey])

  const connect = useCallback(() => {
    if (!roomId || !playerName || !connectionKey) {
      router.push("/multiplayer")
      return
    }

    // Check if already connected or connection in progress
    const now = Date.now()
    if (
      connectionAttemptsInProgress.has(connectionKey) ||
      (gameConnections.has(connectionKey) && 
       gameConnections.get(connectionKey)!.readyState !== WebSocket.CLOSED) ||
      (lastConnectionAttempts.has(connectionKey) && 
       now - lastConnectionAttempts.get(connectionKey)! < RECONNECT_THROTTLE_MS)
    ) {
      console.log(`[GAME] Skipping connection for ${connectionKey} - already in progress or connected`)
      setIsConnecting(false)
      return
    }

    setIsConnecting(true)
    setError("")
    setErrorDetails("")
    
    // Mark connection attempt in progress
    connectionAttemptsInProgress.add(connectionKey)
    lastConnectionAttempts.set(connectionKey, now)
    
    const wsUrl = `ws://localhost:3001?room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(playerName)}`
    console.log(`[GAME] Connecting to WebSocket: ${wsUrl}`)
    
    try {
      const newWs = new WebSocket(wsUrl)
      
      newWs.onopen = () => {
        console.log(`[GAME] Successfully connected to game server for room ${roomId}`)
        connectionAttemptsInProgress.delete(connectionKey)
        gameConnections.set(connectionKey, newWs)
        
        if (!mountedRef.current) return
        
        setIsConnecting(false)
        setRetryCount(0)
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout)
          setReconnectTimeout(null)
        }
        
        // Request current game state
        setTimeout(() => {
          if (mountedRef.current && newWs.readyState === WebSocket.OPEN) {
            try {
              newWs.send(JSON.stringify({ type: "getState" }))
              setLastActivity(Date.now())
            } catch (err) {
              console.error("[GAME] Error requesting initial state:", err)
            }
          }
        }, 100)
      }

      newWs.onmessage = (event) => {
        if (!mountedRef.current) return
        
        try {
          const data = JSON.parse(event.data)
          console.log("[GAME] Received WebSocket message:", data)
          setLastActivity(Date.now())
          
          switch (data.type) {
            case "waitingToStart":
              setGameState(prev => ({
                ...prev,
                isGameStarted: false,
                players: data.players
              }))
              break
              
            case "gameStarted":
              setGameState(prev => ({
                ...prev,
                isGameStarted: true,
                stage: data.stage,
                currentCard: data.currentCard,
                players: data.players
              }))
              break
              
            case "guessResult":
              setGameState(prev => ({
                ...prev,
                players: prev.players.map(p => 
                  p.name === data.playerName ? { ...p, score: data.score } : p
                ),
                stage: data.nextStage,
                currentCard: data.currentCard
              }))
              break
              
            case "gameOver":
              setGameState(prev => ({
                ...prev,
                isGameOver: true,
                winners: data.winners,
                players: data.scores
              }))
              break
              
            case "playerLeft":
              console.log("[GAME] Player left event received:", data)
              setGameState(prev => ({
                ...prev,
                players: prev.players.filter(p => p.name !== data.playerName)
              }))
              break
              
            case "playerJoined":
              console.log("[GAME] Player joined event received:", data)
              setGameState(prev => ({
                ...prev,
                players: data.players
              }))
              break
              
            case "pong":
              console.log("[GAME] Received pong from server")
              break
              
            case "error":
              console.error(`[GAME] Server error: ${data.code} - ${data.message}`)
              setErrorDetails(`Server error: ${data.code} - ${data.message}`)
              
              // Only set the full error if it's critical
              if (data.code === "ROOM_NOT_FOUND" || data.code === "DUPLICATE_CONNECTION") {
                setError(`Server error: ${data.message}`)
              }
              break
              
            case "roomClosed":
              setError(`Room closed: ${data.reason}`)
              break
          }
        } catch (err) {
          console.error("[GAME] Error parsing WebSocket message:", err, "Raw message:", event.data)
          setErrorDetails(`Error parsing message: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      }

      newWs.onerror = (error) => {
        console.error("[GAME] WebSocket error:", error)
        connectionAttemptsInProgress.delete(connectionKey)
        
        if (!mountedRef.current) return
        
        setErrorDetails(`Connection error details: ${error.type}`)
        setError(`Connection error. Please try again.`)
        setIsConnecting(false)
      }

      newWs.onclose = (event) => {
        console.log(`[GAME] WebSocket closed with code ${event.code}, reason: ${event.reason || "No reason provided"}`)
        connectionAttemptsInProgress.delete(connectionKey)
        gameConnections.delete(connectionKey)
        
        if (!mountedRef.current) return
        
        setIsConnecting(false)
        
        let errorMessage = "";
        
        // Handle specific error codes
        switch (event.code) {
          case 1000:
            // Normal closure
            console.log("[GAME] Clean disconnection")
            break;
          case 4000:
            errorMessage = "Missing room ID or player name"
            break;
          case 4001:
            errorMessage = "You're already connected to this room in another window"
            break;
          case 4002:
            errorMessage = "The room no longer exists"
            break;
          case 4003:
            errorMessage = "Server error occurred"
            break;
          default:
            if (event.code >= 4000) {
              errorMessage = `Application error: ${event.reason || "Unknown error"}`
            } else if (event.code >= 1002) {
              errorMessage = "Connection error: " + (event.reason || `Code ${event.code}`)
            }
        }
        
        if (errorMessage) {
          setError(errorMessage)
          setErrorDetails(`WebSocket closed with code ${event.code}, reason: ${event.reason || "No reason provided"}`)
        }
        
        // Retry connection after a delay, with increasing backoff
        if (!errorMessage && retryCount < 5 && mountedRef.current) {
          const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000)
          console.log(`[GAME] Will attempt to reconnect in ${backoffTime}ms (attempt ${retryCount + 1})`)
          
          const timeout = setTimeout(() => {
            if (mountedRef.current) {
              setRetryCount(prev => prev + 1)
              connect()
            }
          }, backoffTime)
          setReconnectTimeout(timeout)
        } else if (!errorMessage) {
          setError("Unable to connect to server after multiple attempts. Please refresh the page.")
        }
      }
    } catch (err: any) {
      console.error("[GAME] Error creating WebSocket:", err)
      connectionAttemptsInProgress.delete(connectionKey)
      setError(`Failed to create WebSocket connection: ${err.message}`)
      setErrorDetails(`Stack: ${err.stack || 'No stack trace available'}`)
      setIsConnecting(false)
    }
  }, [roomId, playerName, router, retryCount, reconnectTimeout, connectionKey])

  useEffect(() => {
    mountedRef.current = true

    // Check if we already have a connection
    if (connectionKey && gameConnections.has(connectionKey)) {
      const existingWs = gameConnections.get(connectionKey)!
      if (existingWs.readyState === WebSocket.OPEN) {
        console.log(`[GAME] Using existing connection for ${connectionKey}`)
        setIsConnecting(false)
        
        // Request current state
        try {
          existingWs.send(JSON.stringify({ type: "getState" }))
        } catch (err) {
          console.error("[GAME] Error requesting state from existing connection:", err)
        }
        
        return () => {
          mountedRef.current = false
        }
      }
    }
    
    // No usable connection, create a new one
    connect()

    // Set up state refresh interval for resilience
    const stateInterval = setInterval(() => {
      const now = Date.now()
      // If no activity in 10 seconds, request state
      if (now - lastActivity > 10000 && connectionKey && gameConnections.has(connectionKey)) {
        const ws = gameConnections.get(connectionKey)!
        if (ws.readyState === WebSocket.OPEN) {
          console.log("[GAME] No activity for 10s, requesting game state")
          refreshGameState()
        }
      }
    }, 5000) // Check every 5 seconds
    
    return () => {
      mountedRef.current = false
      clearInterval(stateInterval)
      
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
    }
  }, [connect, connectionKey, lastActivity, refreshGameState])

  // Heartbeat ping to keep connection alive
  useEffect(() => {
    if (!connectionKey) return

    const pingInterval = setInterval(() => {
      if (gameConnections.has(connectionKey)) {
        const ws = gameConnections.get(connectionKey)!
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: "ping" }))
          } catch (err) {
            console.error("[GAME] Error sending ping:", err)
          }
        }
      }
    }, 30000) // Send ping every 30 seconds
    
    return () => {
      clearInterval(pingInterval)
    }
  }, [connectionKey])

  const handleGuess = (guess: string) => {
    if (!connectionKey) return
    
    if (gameConnections.has(connectionKey)) {
      const ws = gameConnections.get(connectionKey)!
      if (ws.readyState === WebSocket.OPEN) {
        try {
          console.log(`[GAME] Sending guess: ${guess}`)
          ws.send(JSON.stringify({ type: "guess", guess }))
          setLastActivity(Date.now())
        } catch (err) {
          console.error("[GAME] Error sending guess:", err)
          setErrorDetails("Failed to submit guess: " + (err instanceof Error ? err.message : 'Unknown error'))
          refreshGameState()
        }
      } else {
        console.warn("[GAME] Cannot send guess - WebSocket not open")
        setError("Connection to server lost. Attempting to reconnect...")
        connect()
      }
    } else {
      console.warn("[GAME] Cannot send guess - No connection found")
      setError("Connection to server lost. Attempting to reconnect...")
      connect()
    }
  }

  const handleStartGame = () => {
    if (!connectionKey) return
    
    if (gameConnections.has(connectionKey)) {
      const ws = gameConnections.get(connectionKey)!
      if (ws.readyState === WebSocket.OPEN) {
        try {
          console.log("[GAME] Sending startGame message")
          ws.send(JSON.stringify({ type: "startGame" }))
          setLastActivity(Date.now())
        } catch (err) {
          console.error("[GAME] Error starting game:", err)
          setErrorDetails("Failed to start game: " + (err instanceof Error ? err.message : 'Unknown error'))
          refreshGameState()
        }
      } else {
        console.warn("[GAME] Cannot start game - WebSocket not open")
        setError("Connection to server lost. Attempting to reconnect...")
        connect()
      }
    } else {
      console.warn("[GAME] Cannot start game - No connection found")
      setError("Connection to server lost. Attempting to reconnect...")
      connect()
    }
  }

  const handleLeaveRoom = () => {
    if (connectionKey && gameConnections.has(connectionKey)) {
      const ws = gameConnections.get(connectionKey)
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close(1000, "User left room")
      }
      gameConnections.delete(connectionKey)
    }
    router.push("/multiplayer")
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-pink-900 p-4 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Error</h2>
          <p className="text-white/80 mb-2">{error}</p>
          {errorDetails && (
            <p className="text-white/60 text-xs mb-4 bg-black/20 p-2 rounded overflow-auto max-h-24">
              {errorDetails}
            </p>
          )}
          <div className="space-y-3">
            <button
              onClick={() => {
                setError("")
                setErrorDetails("")
                setRetryCount(0)
                connect()
              }}
              className="w-full px-4 py-2 bg-blue-500/40 hover:bg-blue-500/60 text-white rounded-lg transition-all duration-200"
            >
              Reconnect
            </button>
            <button
              onClick={handleLeaveRoom}
              className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200"
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-pink-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={handleLeaveRoom}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Leave Room
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connectionKey && gameConnections.has(connectionKey) && gameConnections.get(connectionKey)!.readyState === WebSocket.OPEN ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <div className="text-white/80">
              Room: {roomId}
            </div>
          </div>
        </div>

        {isConnecting && (
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg p-3 text-sm flex items-center justify-center gap-2 mb-4">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            Connecting to server...
          </div>
        )}

        {!gameState.isGameStarted ? (
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Waiting to Start</h2>
            <p className="text-white/60 mb-4">
              {gameState.players.length} player{gameState.players.length !== 1 ? "s" : ""} in room
            </p>
            <div className="mb-4">
              <div className="text-white/80 text-sm mb-2">Players:</div>
              {gameState.players.length === 0 ? (
                <p className="text-white/40 italic">No players have joined yet</p>
              ) : (
                <div className="space-y-1">
                  {gameState.players.map((player, index) => (
                    <div key={index} className="bg-white/5 rounded p-2 text-white/80">
                      {player.name} {player.name === playerName ? "(You)" : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleStartGame}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200"
              disabled={gameState.players.length === 0}
            >
              Start Game
            </button>
          </div>
        ) : gameState.isGameOver ? (
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Game Over!</h2>
            <p className="text-white/80 mb-4">
              Winner{gameState.winners.length !== 1 ? "s" : ""}: {gameState.winners.join(", ")}
            </p>
            <div className="space-y-2 mb-6">
              {gameState.players.map((player, index) => (
                <div key={index} className="flex justify-between items-center text-white/80">
                  <span>{player.name} {player.name === playerName ? "(You)" : ""}</span>
                  <span>{player.score} points</span>
                </div>
              ))}
            </div>
            <button
              onClick={handleStartGame}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200"
            >
              Play Again
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {gameState.players.map((player, index) => (
                <div key={index} className="bg-white/5 backdrop-blur-sm rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-white">{player.name} {player.name === playerName ? "(You)" : ""}</span>
                    <span className="text-yellow-400">{player.score} points</span>
                  </div>
                </div>
              ))}
            </div>

            {gameState.currentCard && (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 text-center">
                <div className="text-4xl mb-4">
                  {gameState.currentCard.value === 1 ? "A" :
                   gameState.currentCard.value === 11 ? "J" :
                   gameState.currentCard.value === 12 ? "Q" :
                   gameState.currentCard.value === 13 ? "K" :
                   gameState.currentCard.value}
                  {gameState.currentCard.suit === "hearts" ? "♥" :
                   gameState.currentCard.suit === "diamonds" ? "♦" :
                   gameState.currentCard.suit === "clubs" ? "♣" : "♠"}
                </div>

                <div className="space-y-2">
                  {gameState.stage === "red_black" && (
                    <>
                      <button
                        onClick={() => handleGuess("red")}
                        className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all duration-200"
                      >
                        Red
                      </button>
                      <button
                        onClick={() => handleGuess("black")}
                        className="w-full px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 rounded-lg transition-all duration-200"
                      >
                        Black
                      </button>
                    </>
                  )}

                  {gameState.stage === "higher_lower" && (
                    <>
                      <button
                        onClick={() => handleGuess("higher")}
                        className="w-full px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-all duration-200"
                      >
                        Higher
                      </button>
                      <button
                        onClick={() => handleGuess("lower")}
                        className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all duration-200"
                      >
                        Lower
                      </button>
                    </>
                  )}

                  {gameState.stage === "inside_outside" && (
                    <>
                      <button
                        onClick={() => handleGuess("inside")}
                        className="w-full px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-all duration-200"
                      >
                        Inside
                      </button>
                      <button
                        onClick={() => handleGuess("outside")}
                        className="w-full px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-all duration-200"
                      >
                        Outside
                      </button>
                    </>
                  )}

                  {gameState.stage === "suit" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleGuess("hearts")}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all duration-200"
                      >
                        ♥ Hearts
                      </button>
                      <button
                        onClick={() => handleGuess("diamonds")}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all duration-200"
                      >
                        ♦ Diamonds
                      </button>
                      <button
                        onClick={() => handleGuess("clubs")}
                        className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 rounded-lg transition-all duration-200"
                      >
                        ♣ Clubs
                      </button>
                      <button
                        onClick={() => handleGuess("spades")}
                        className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 rounded-lg transition-all duration-200"
                      >
                        ♠ Spades
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 