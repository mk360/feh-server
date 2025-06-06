import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import GameWorld from "feh-battles";
import { createServer } from "http";
import shortid from "short-unique-id";
import { Server } from "socket.io";
import { z } from "zod";
import { validateRequest } from "zod-express-middleware";
import { retrieveTeam, saveTeam } from "./session-store";

const uid = new shortid({ length: 10 });

/**
 * Maps room IDs (game IDs) to their matching GameWorlds
 */
const GAME_WORLDS_MAP: { [k: string]: GameWorld } = {};

/**
 * Maps room IDs (game IDs) to socket IDs inside that room
 */
const SOCKETS_BY_ROOM: { [k: string]: string[] } = {};

/**
 * Map socket IDs to the rooms they are in.
 */
const ROOMS_BY_SOCKETS: { [k: string]: string[] } = {};

function groupBy<T>(iterable: T[], filter: (element: T) => string) {
    const group: { [k: string]: T[] } = {};
    for (let item of iterable) {
        const key = filter(item);
        if (!group[key]) group[key] = [];
        group[key].push(item);
    }

    return group;
}

interface MapCoords {
    x: number;
    y: number;
}

const PORT = 3800;

const app = express();

app.use(cors());
app.use(bodyParser.json());

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    },
});

function parseEntities(world: GameWorld) {
    const entities = world.getEntities("Name");
    const entitiesDict: {
        [k: string]: {
            [k: string]: any
        }
    } = {};

    entities.forEach((entity) => {
        const entityObject = entity.getObject(false);
        entitiesDict[entity.id] = {
            tags: Array.from(entity.tags),
            components: groupBy(entityObject.components, (component) => component.type)
        };
    });

    return entitiesDict;
};

io.on("connection", (socket) => {
    socket.on("loading-complete", ({ roomId }) => {
        const gameWorld = GAME_WORLDS_MAP[roomId];

        socket.join(roomId);
        if (!gameWorld) {

        } else {
            const teamIds = gameWorld.state.teamIds;
            socket.emit("allow-control", ({ ids: teamIds, id: socket.handshake.auth.uuid, currentSide: gameWorld.state.currentSide }));
        }
    });

    socket.on("create-session", (team) => {
        const newId = uid.randomUUID();
        socket.join(newId);
        try {
            teamSchema.array().parse(team);
            SOCKETS_BY_ROOM[newId] = [socket.handshake.auth.uuid];
            ROOMS_BY_SOCKETS[socket.handshake.auth.uuid] = [newId];
            saveTeam(socket.handshake.auth.uuid, processTeam(team));
            socket.emit("confirm", "Your session has been created. The session ID was copied to your clipboard.");
            socket.emit("sid", newId);
        } catch (err) {
            console.log(err)
            socket.emit("error", "Your team is invalid. Please fix it in the teambuilder.");
        }
    }).on("disconnect", () => {
        const uuid = socket.handshake.auth.uuid;
        const rooms = ROOMS_BY_SOCKETS[uuid] ?? [];
        for (let room of rooms) {
            socket.leave(room);
            SOCKETS_BY_ROOM[room].splice(SOCKETS_BY_ROOM[room].indexOf(uuid), 1);
            if (SOCKETS_BY_ROOM[room].length === 0) {
                delete SOCKETS_BY_ROOM[room]; // everybody left, room doesn't exist anymore
                delete GAME_WORLDS_MAP[room]; // delete game world. TODO : check if gameworld stays in memory or gets Garbage Collected
            }
        }
        delete ROOMS_BY_SOCKETS[uuid];
    }).on("join", ({ roomId, uuid, team }) => {
        if (!SOCKETS_BY_ROOM[roomId]) {
            socket.emit("error", "This session does not exist.");
            return;
        }
        if (SOCKETS_BY_ROOM[roomId].length >= 2) {
            socket.emit("error", "This session is full.");
            return;
        }

        if (SOCKETS_BY_ROOM[roomId].includes(uuid)) {
            socket.emit("error", "You already joined this session.");
            return;
        }

        SOCKETS_BY_ROOM[roomId].push(uuid);
        socket.join(roomId);
        io.in(roomId).fetchSockets().then(() => {
            const [firstId, secondId] = SOCKETS_BY_ROOM[roomId];
            const newWorld = new GameWorld({
                team1: SOCKETS_BY_ROOM[roomId][0],
                team2: SOCKETS_BY_ROOM[roomId][1],
                trackChanges: true,
            });

            newWorld.generateMap();
            newWorld.initiate({
                team1: retrieveTeam(firstId),
                team2: processTeam(team),
            });
            newWorld.startTurn();

            GAME_WORLDS_MAP[roomId] = newWorld;
            io.in(roomId).emit("join-session", roomId);
        });
    });
    socket.on("ready", ({ roomId }) => {
        const world = GAME_WORLDS_MAP[roomId];
        socket.emit("response", world.state.lastChangeSequence);
    });

    // il faudra trouver un moyen de batch plusieurs responses de sockets
    socket.on("request preview movement", ({ unitId, roomId }: { unitId: string, roomId: string }) => {
        const world = GAME_WORLDS_MAP[roomId];
        if (world?.getEntity(unitId)) {
            const { movementTiles, attackTiles, warpTiles, targetableTiles, effectiveness, assistTiles } = world?.getUnitMovement(unitId);
            let movementArray: number[] = [];
            movementTiles.forEach((comp) => {
                movementArray.push(comp.x * 10 + comp.y);
            });
            const attackableArray: number[] = [];
            attackTiles.forEach((comp) => {
                attackableArray.push(comp.x * 10 + comp.y);
            });
            const warpableArray: number[] = [];
            warpTiles.forEach((comp) => {
                warpableArray.push(comp.x * 10 + comp.y);
            });

            const targetableArray: number[] = [];
            targetableTiles.forEach((comp) => {
                targetableArray.push(comp.x * 10 + comp.y);
            });

            const assistArray: number[] = [];
            assistTiles.forEach((comp) => {
                assistArray.push(comp.x * 10 + comp.y);
            });

            movementArray = movementArray.filter((t) => !assistArray.includes(t));

            const stats = world.getUnitMapStats(unitId);

            socket.emit("response preview movement", {
                movement: movementArray,
                attack: attackableArray,
                warpTiles: warpableArray,
                targetableTiles: targetableArray,
                effectiveness,
                assistArray,
                unitId
            });

            socket.emit("response unit map stats", {
                unitId,
                ...stats
            });
        }
    }).on("request confirm movement", (payload: {
        unitId: string,
        roomId: string,
        x: number,
        y: number
    }) => {
        const world = GAME_WORLDS_MAP[payload.roomId];
        const oldPosition = world.getEntity(payload.unitId)?.getOne("Position");
        if (world.previewUnitMovement(payload.unitId, payload) && (oldPosition.x !== payload.x || oldPosition.y !== payload.y)) {
            const actionEnd = world.moveUnit(payload.unitId, payload, true);
            io.in(payload.roomId).emit("response confirm movement", {
                unitId: payload.unitId,
                ...payload
            });
            io.in(payload.roomId).emit("response", actionEnd);

            const newState = parseEntities(world);
            io.in(payload.roomId).emit("update-entities", newState);
        } else {
            io.in(payload.roomId).emit("response confirm movement", {
                valid: false,
                unitId: payload.unitId,
                x: oldPosition!.x,
                y: oldPosition!.y,
            });
        }
    }).on("request preview battle", (payload: { unit: string, uuid: string, x: number, y: number, position: MapCoords, path: MapCoords[], roomId: string }) => {
        const gameWorld = GAME_WORLDS_MAP[payload.roomId];
        const preview = gameWorld.previewCombat(payload.unit, { x: payload.x, y: payload.y }, payload.position, payload.path);
        socket.emit("response preview battle", preview);
    }).on("request freeze unit", (payload: {
        unitId: string,
        x: number,
        uuid: string,
        roomId: string,
        y: number
    }) => {
        const world = GAME_WORLDS_MAP[payload.roomId];
        const endAction = world.endAction(payload.unitId);
        io.in(payload.roomId).emit("response confirm movement", {
            valid: true,
            unitId: payload.unitId,
            x: payload.x,
            y: payload.y,
        });
        io.in(payload.roomId).emit("response", endAction);
    }).on("request confirm combat", (payload: { unitId: string, uuid: string, x: number, y: number, attackerCoordinates: MapCoords, path: MapCoords[], roomId: string }) => {
        const world = GAME_WORLDS_MAP[payload.roomId];
        const combatActions = world.runCombat(payload.unitId, payload.attackerCoordinates, { x: payload.x, y: payload.y }, payload.path);
        io.in(payload.roomId).emit("response", combatActions);
    }).on("request preview assist", (payload: { source: string, uuid: string, sourceCoordinates: MapCoords, targetCoordinates: MapCoords, roomId: string }) => {
        const world = GAME_WORLDS_MAP[payload.roomId];
        const preview = world.previewAssist(payload.source, payload.targetCoordinates, payload.sourceCoordinates);
        socket.emit("response preview assist", preview);
    }).on("request confirm assist", (payload: { source: string, uuid: string, targetCoordinates: MapCoords, sourceCoordinates: MapCoords, roomId: string }) => {
        const world = GAME_WORLDS_MAP[payload.roomId];
        const assistActions = world.runAssist(payload.source, payload.targetCoordinates, payload.sourceCoordinates, []);
        io.in(payload.roomId).emit("response", assistActions);
    }).on("request enemy range", (payload: { roomId: string; state: boolean }) => {
        const world = GAME_WORLDS_MAP[payload.roomId];
        const tiles = Array.from(world.getEnemyRange(socket.handshake.auth.uuid, payload.state));
        socket.emit("response enemy range", tiles);
    }).on("request update", (payload: { uuid: string, roomId: string }) => {
        const world = GAME_WORLDS_MAP[payload.roomId];
        if (world) {
            const updatedEntities = parseEntities(world);
            io.in(payload.roomId).emit("update-entities", updatedEntities);
        }
    }).on("request end turn", ({ roomId }: { uuid: string, roomId: string }) => {
        const world = GAME_WORLDS_MAP[roomId];
        const newTurn = world.startTurn();
        io.in(roomId).emit("response", newTurn);
    });
});

const teamSchema = z.object({
    name: z.string(),
    weapon: z.string().optional(),
    assist: z.string().optional(),
    special: z.string().optional(),
    A: z.string().optional(),
    B: z.string().optional(),
    C: z.string().optional(),
    S: z.string().optional(),
    asset: z.enum(["hp", "atk", "spd", "def", "res", ""]).optional(),
    flaw: z.enum(["hp", "atk", "spd", "def", "res", ""]).optional(),
    merges: z.number().max(10).min(0).int(),
}).required();

app.get("/moveset", (req, res) => {
    const character = req.query.name.toString();
    try {
        const moveset = GameWorld.movesets.getCharacterMoveset(decodeURIComponent(character));
        res.json(moveset);
    } catch (e) {
        res.writeHead(400);
        console.log(e);
    }
    res.end();
});

app.get("/worlds/:id", (req, res) => {
    const world = GAME_WORLDS_MAP[req.params.id];
    if (world) {
        const heroes = parseEntities(world);
        console.dir({ heroes }, {
            depth: Infinity
        });
        res.status(200);
        res.send({
            mapId: world.state.mapId,
            heroes
        });
    } else {
        res.status(404);
        res.send("No active session found");
    }
});

app.post("/team", validateRequest({
    body: teamSchema.array(),
}), (req, res) => {
    const castBody = teamSchema.array().parse(req.body);
    const normalizedBody = processTeam(castBody);
    const validation = GameWorld.validator.validateTeam(normalizedBody);

    if (Object.keys(validation).length) {
        res.status(400).json(validation);
    } else {
        saveTeam(req.headers.authorization, normalizedBody);
        res.status(200).json({});
    }
    res.end();
});

server.listen(PORT, () => {
    console.log("server listening at " + PORT);
});

function processTeam(team) {
    return team.map(member => ({
        weapon: member.weapon ?? "",
        skills: {
            assist: member.assist ?? "",
            special: member.special ?? "",
            A: member.A ?? "",
            B: member.B ?? "",
            C: member.C ?? "",
            S: member.S ?? "",
        },
        rarity: 5,
        name: member.name ?? "",
        asset: member.asset ?? "",
        flaw: member.flaw ?? "",
        merges: member.merges ?? 0,
    }));
};
