"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface CreateRoomProps {
  onClose: () => void
}

export default function CreateRoom({ onClose }: CreateRoomProps) {
  const router = useRouter()
  const [playerName, setPlayerName] = useState("")
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateRoom = () => {
    // Reset error
    setError("")
    
    // Validate player name
    if (!playerName.trim()) {
      setError("Please enter your name")
      return
    }
    
    if (playerName.trim().length < 2) {
      setError("Name must be at least 2 characters")
      return
    }
    
    if (playerName.trim().length > 15) {
      setError("Name must be 15 characters or less")
      return
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(playerName.trim())) {
      setError("Name can only contain letters, numbers, underscores and hyphens")
      return
    }

    setIsCreating(true)
    
    // Generate a random room ID with 6 alphanumeric characters
    const roomId = Math.random().toString(36).substring(2, 8)
    
    // Navigate to the game page with the room ID and player name as query parameters
    try {
      router.push(`/game?room=${roomId}&name=${encodeURIComponent(playerName.trim())}`)
    } catch (error) {
      console.error("Error navigating to game page:", error)
      setError("An error occurred while creating the room")
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-gradient-to-br from-indigo-900 to-pink-900 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-white mb-4">Create New Room</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-white/60 text-sm mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value)
                setError("")
              }}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/30"
              placeholder="Enter your name"
              maxLength={15}
              disabled={isCreating}
            />
            {error && (
              <p className="text-red-400 text-sm mt-1">{error}</p>
            )}
            <p className="text-white/40 text-xs mt-1">
              This name will be shown to other players in the game
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCreateRoom}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 flex justify-center items-center"
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Creating...
                </>
              ) : (
                "Create Room"
              )}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200"
              disabled={isCreating}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 