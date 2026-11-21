
import secrets

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Store rooms and their connected players
rooms = {}


QUESTIONS = [
    "Who's most likely to accidentally text their ex at 3 AM?",
    "Who's most likely to become famous?",
    "Who's most likely to survive a zombie apocalypse?",
    "Who's most likely to get married in Vegas?",
    "Who's most likely to disappear on a night out?"
]



class CreateRoomRequest(BaseModel):
    player_name: str


class JoinRoomRequest(BaseModel):
    player_name: str


def validate_name(name: str):
    name = name.strip()

    if not name or len(name) > 20:
        raise HTTPException(
            status_code=400,
            detail="Name must contain 1–20 characters"
        )

    return name


@app.get("/")
def home():
    return {"message": "Party Mode backend is running!"}


@app.post("/rooms")
def create_room(request: CreateRoomRequest):
    name = validate_name(request.player_name)

    while True:
        code = str(secrets.randbelow(900000) + 100000)
        if code not in rooms:
            break

    player_id = secrets.token_urlsafe(16)

    
    rooms[code] = {
        "players": {player_id: name},
        "connections": {},
        "host_id": player_id,
        "game_state": "lobby",
        "question_index": 0
}


    return {
        "room_code": code,
        "player_id": player_id,
        "players": [name]
    }


@app.post("/rooms/{room_code}/join")
def join_room(room_code: str, request: JoinRoomRequest):
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")

    name = validate_name(request.player_name)
    room = rooms[room_code]

    if name in room["players"].values():
        raise HTTPException(status_code=409, detail="Name already taken")

    player_id = secrets.token_urlsafe(16)
    room["players"][player_id] = name

    return {
        "room_code": room_code,
        "player_id": player_id,
        "players": list(room["players"].values())
    }


@app.get("/rooms/{room_code}")
def get_room(room_code: str):
    if room_code not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")

    return {
        "room_code": room_code,
        "players": list(rooms[room_code]["players"].values())
    }


async def broadcast_players(room_code: str):
    room = rooms.get(room_code)

    if not room:
        return

    message = {
        "type": "players_updated",
        "players": list(room["players"].values())
    }

    for connection in list(room["connections"].values()):
        try:
            await connection.send_json(message)
        except Exception:
            pass


@app.websocket("/ws/{room_code}/{player_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_code: str,
    player_id: str
):
    room = rooms.get(room_code)

    if not room or player_id not in room["players"]:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    room["connections"][player_id] = websocket

    await broadcast_players(room_code)

    try:
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        pass

    finally:
        if room["connections"].get(player_id) is websocket:
            del room["connections"][player_id]
            room["players"].pop(player_id, None)
            await broadcast_players(room_code)

            if not room["players"]:
                rooms.pop(room_code, None)


class StartGameRequest(BaseModel):
    player_id: str


@app.post("/rooms/{room_code}/start")
async def start_game(room_code: str, request: StartGameRequest):
    room = rooms.get(room_code)

    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if request.player_id != room["host_id"]:
        raise HTTPException(
            status_code=403,
            detail="Only the host can start the game"
        )

    if room["game_state"] != "lobby":
        raise HTTPException(
            status_code=400,
            detail="Game has already started"
        )

    if len(room["players"]) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least two players are required"
        )

    room["game_state"] = "playing"
    room["question_index"] = 0

    await broadcast_game_state(room_code)

    return {"message": "Game started!"}


async def broadcast_game_state(room_code: str):
    room = rooms.get(room_code)

    if not room:
        return

    message = {
        "type": "game_state_updated",
        "game_state": room["game_state"],
        "question": QUESTIONS[room["question_index"]]
    }

    for connection in list(room["connections"].values()):
        try:
            await connection.send_json(message)
        except Exception:
            pass
