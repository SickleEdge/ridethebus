"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Trophy, Users, Crown } from "lucide-react"

type Player = {
  id: string
  name: string
  score: number
  isOut: boolean
  currentRound: number
}

type Room = {
  id: string
  players: Player[]
  currentRound: number
  isGameOver: boolean
}

export default function MultiplayerGame() {
  const [room, setRoom] = useState<Room | null>(null)
  const [playerName, setPlayerName] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [isHost, setIsHost] = useState(false)
  const [showWaiting, setShowWaiting] = useState(false)

  const createRoom = () => {
    // TODO: Implement room creation with WebSocket
    const newRoom: Room = {
      id: Math.random().toString(36).substring(7),
      players: [],
      currentRound: 1,
      isGameOver: false
    }
    setRoom(newRoom)
    setIsHost(true)
    setShowWaiting(true)
  }

  const joinRoom = () => {
    // TODO: Implement room joining with WebSocket
    setShowWaiting(true)
  }

  const startGame = () => {
    // TODO: Implement game start with WebSocket
  }

  const renderWaitingRoom = () => (
    <div className="flex flex-col items-center gap-4 p-4">
      <h2 className="text-2xl font-bold text-white">Waiting Room</h2>
      <div className="w-full max-w-md bg-white/10 rounded-xl p-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-white">Room Code: {room?.id}</span>
          {isHost && (
            <Button
              className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
              onClick={startGame}
            >
              Start Game
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {room?.players.map((player) => (
            <div key={player.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
              <span className="text-white">{player.name}</span>
              {player.id === room.players[0]?.id && <Crown className="h-5 w-5 text-yellow-400" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderGame = () => (
    <div className="flex flex-col items-center gap-4 p-4">
      <div className="w-full max-w-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-white" />
          <span className="text-white">{room?.players.length}/8 Players</span>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-400" />
          <span className="text-white">Round {room?.currentRound}/7</span>
        </div>
      </div>

      <div className="w-full max-w-md bg-white/10 rounded-xl p-4">
        <div className="grid grid-cols-2 gap-4">
          {room?.players.map((player) => (
            <div key={player.id} className="flex flex-col items-center p-4 bg-white/5 rounded-lg">
              <span className="text-white font-bold">{player.name}</span>
              <span className="text-white/70">Score: {player.score}</span>
              {player.isOut && <span className="text-red-400 text-sm">Out</span>}
              {!player.isOut && <span className="text-green-400 text-sm">Playing</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  if (!showWaiting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4">
        <div className="w-full max-w-md space-y-4">
          <h1 className="text-3xl font-bold text-center text-white mb-8">Multiplayer Mode</h1>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Your Name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full px-4 py-2 rounded-xl bg-white/10 text-white placeholder-white/50 border border-white/20 focus:outline-none focus:border-white/40"
              />
            </div>

            <Button
              className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-xl"
              onClick={createRoom}
            >
              Create Room
            </Button>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Room Code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                className="flex-1 px-4 py-2 rounded-xl bg-white/10 text-white placeholder-white/50 border border-white/20 focus:outline-none focus:border-white/40"
              />
              <Button
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-xl"
                onClick={joinRoom}
              >
                Join
              </Button>
            </div>
          </div>

          <div className="text-sm text-white/70 mt-8">
            <p>• Up to 8 players per room</p>
            <p>• 7 rounds per game</p>
            <p>• Player with highest score wins</p>
            <p>• Wait for all players to finish each round</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {room?.isGameOver ? renderGame() : renderWaitingRoom()}
    </div>
  )
} 