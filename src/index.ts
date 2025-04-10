import GameWorld from "feh-battles";
import express from "express";
import { createServer } from "http";
import bodyParser from "body-parser";
import cors from "cors";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import { Server } from "socket.io";
import { team1, team2 } from "./debug-world";
import shortid from "short-unique-id";

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
        console.log("gameworld check", !!gameWorld)
        socket.join(roomId);
        if (!gameWorld) {

        } else {
            const teamIds = gameWorld.state.teamIds;
            socket.emit("allow-control", ({ ids: teamIds, id: socket.handshake.auth.uuid, currentSide: gameWorld.state.currentSide }));
        }
    });

    socket.on("create-session", () => {
        const newId = uid.randomUUID();
        socket.join(newId);

        SOCKETS_BY_ROOM[newId] = [socket.handshake.auth.uuid];
        ROOMS_BY_SOCKETS[socket.handshake.auth.uuid] = [newId];
        socket.emit("confirm", "Your session has been created. Please share the ID <code>" + newId + "</code> with your opponent.");
        socket.emit("sid", newId);
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
    }).on("join", ({ roomId, uuid }) => {
        if (!SOCKETS_BY_ROOM[roomId]) {
            socket.emit("error", "This session does not exist.");
            return;
        }
        if (SOCKETS_BY_ROOM[roomId].length >= 2) {
            socket.emit("error", "This session is full.");
            return;
        }

        SOCKETS_BY_ROOM[roomId].push(uuid);
        socket.join(roomId);
        io.in(roomId).fetchSockets().then(() => {
            const newWorld = new GameWorld({
                team1: SOCKETS_BY_ROOM[roomId][0],
                team2: SOCKETS_BY_ROOM[roomId][1],
                trackChanges: true,
            });
            newWorld.generateMap();
            newWorld.initiate({
                team1: team1,
                team2: team2,
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
    }).on("request confirm movement", (payload: {
        unitId: string,
        roomId: string,
        x: number,
        y: number
    }) => {
        const world = GAME_WORLDS_MAP[payload.roomId];
        if (world.previewUnitMovement(payload.unitId, payload)) {
            const actionEnd = world.moveUnit(payload.unitId, payload, true);
            io.in(payload.roomId).emit("response confirm movement", {
                unitId: payload.unitId,
                ...payload
            });
            io.in(payload.roomId).emit("response", actionEnd);

            const newState = parseEntities(world);
            io.in(payload.roomId).emit("update-entities", newState);
        } else {
            const oldPosition = world.getEntity(payload.unitId)?.getOne("Position");
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
        world.moveUnit(payload.unitId, payload, true);
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
    }).on("request end turn", ({ uuid, roomId }: { uuid: string, roomId: string }) => {
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
    passivea: z.string().optional(),
    passiveb: z.string().optional(),
    passivec: z.string().optional(),
}).array();

app.get("/moveset", (req, res) => {
    const character = req.query.name.toString();
    try {
        const moveset = GameWorld.validator.getCharacterMoveset(decodeURIComponent(character));
        res.write(JSON.stringify(moveset));
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

app.post("/team/", validateRequest({
    body: z.object({
        team1: teamSchema,
        team2: teamSchema
    }).strict()
}), (req, res) => {
    // const world = new GameWorld();
    // world.initiate({
    //     team1: req.body.team1.map((i) => {
    //         return {
    //             name: i.name,
    //             weapon: i.weapon!,
    //             skills: {
    //                 assist: i.assist!,
    //                 special: i.special!,
    //                 A: i.passivea!,
    //                 B: i.passiveb!,
    //                 C: i.passivec!,
    //                 S: "",
    //             },
    //             rarity: 5,
    //         }
    //     }),
    //     team2: req.body.team2.map((i) => {
    //         return {
    //             name: i.name,
    //             weapon: i.weapon!,
    //             skills: {
    //                 assist: i.assist!,
    //                 special: i.special!,
    //                 A: i.passivea!,
    //                 B: i.passiveb!,
    //                 C: i.passivec!,
    //                 S: "",
    //             },
    //             rarity: 5,
    //         }
    //     }),
    // });
    // const id = shortid();
    // GAME_WORLDS_MAP[id] = world;
    // res.send(id);
});

server.listen(PORT, () => {
    console.log("server listening at " + PORT);
});

