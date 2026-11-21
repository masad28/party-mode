
import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [roomCode, setRoomCode] = useState('')
  const [currentRoom, setCurrentRoom] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [players, setPlayers] = useState<string[]>([])
  const [isHost, setIsHost] = useState(false)
  const [error, setError] = useState('')
  const [gameState, setGameState] = useState('lobby')
  const [question, setQuestion] = useState('')

  // Connect to the room's WebSocket
  useEffect(() => {
    if (!currentRoom || !playerId) return

    const socket = new WebSocket(
      `ws://localhost:8000/ws/${currentRoom}/${playerId}`
    )

    
socket.onmessage = (event) => {
  const data = JSON.parse(event.data)

  if (data.type === 'players_updated') {
    setPlayers(data.players)
  }

  if (data.type === 'game_state_updated') {
    setGameState(data.game_state)
    setQuestion(data.question)
  }
}


    socket.onerror = () => {
      setError('Connection error. Please try again.')
    }

    return () => {
      socket.close()
    }
  }, [currentRoom, playerId])

  async function createRoom() {
    if (!playerName.trim()) {
      setError('Please enter your name!')
      return
    }

    try {
      setError('')

      const response = await fetch('http://localhost:8000/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: playerName.trim()
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to create room')
      }

      setPlayers(data.players)
      setPlayerId(data.player_id)
      setIsHost(true)
      setCurrentRoom(data.room_code)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  async function joinRoom() {
    if (!playerName.trim()) {
      setError('Please enter your name!')
      return
    }

    if (!/^\d{6}$/.test(roomCode)) {
      setError('Please enter a valid six-digit room code!')
      return
    }

    try {
      setError('')

      const response = await fetch(
        `http://localhost:8000/rooms/${roomCode}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player_name: playerName.trim()
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to join room')
      }

      setPlayers(data.players)
      setPlayerId(data.player_id)
      setIsHost(false)
      setCurrentRoom(data.room_code)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }


async function startGame() {
  try {
    setError('')

    const response = await fetch(
      `http://localhost:8000/rooms/${currentRoom}/start`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          player_id: playerId
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.detail || 'Failed to start game')
    }

  } catch (err) {
    setError(
      err instanceof Error ? err.message : 'Something went wrong'
    )
  }
}


  function leaveRoom() {
    setCurrentRoom('')
    setPlayerId('')
    setPlayers([])
    setIsHost(false)
    setError('')
    setGameState('lobby')
    setQuestion('')
  }

  return (
    <div className="app">
      {currentRoom ? (
        <>
          <h1>🎉 {isHost ? 'Room Created!' : 'You Joined!'}</h1>

          <p>Room code:</p>
          <h2>{currentRoom}</h2>

          
{gameState === 'lobby' ? (
  <>
    <h3>👥 Players ({players.length})</h3>

    {players.map((player, index) => (
      <p key={index}>🎮 {player}</p>
    ))}

    {isHost && (
      <button
        onClick={startGame}
        disabled={players.length < 2}
      >
        Start Game 🎮
      </button>
    )}
  </>
) : (
  <>
    <h3>🎮 Who's Most Likely To?</h3>
    <p>Round 1</p>
    <h2>{question}</h2>
    <p>Voting coming soon!</p>
  </>
)}

<button onClick={leaveRoom}>
  Leave Room
</button>

        </>
      ) : (
        <>
          <h1>🎉 Party Mode</h1>
          <p>The ultimate game night starts here!</p>

          <input
            type="text"
            placeholder="Your name"
            maxLength={20}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />

          <div>
            <button onClick={createRoom}>
              Create Room
            </button>
          </div>

          <h2>Or join your friends</h2>

          <input
            type="text"
            placeholder="Enter room code"
            maxLength={6}
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
          />

          <button onClick={joinRoom}>
            Join Room
          </button>
        </>
      )}

      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}

export default App
