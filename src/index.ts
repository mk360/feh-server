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
const GAME_WORLDS_MAP: { [k: string]: GameWorld } = {};
const GAME_WORLDS_ID_MAP: { [k: string]: GameWorld } = {};
const UUID_BY_ID: { [k: string]: string } = {};
const SOCKETS_BY_ROOM: { [k: string]: string[] } = {};

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
    socket.on("loading-complete", ({ uuid }) => {
        const gameWorld = GAME_WORLDS_MAP[uuid];
        if (!gameWorld) {

        } else {
            const teamIds = gameWorld.state.teamIds;
            socket.emit("allow-control", ({ ids: teamIds, id: uuid }));
        }
    });

    socket.on("create-session", ({ uuid }) => {
        const newId = uid.randomUUID();
        socket.join(newId);
        UUID_BY_ID[socket.id] = uuid;
        SOCKETS_BY_ROOM[newId] = [uuid];
        socket.emit("confirm", "Your session has been created. Please share the ID <code>" + newId + "</code> with your opponent.");
    }).on("disconnect", () => {
        delete UUID_BY_ID[socket.id];
    }).on("join", ({ roomId, uuid }) => {
        if (!SOCKETS_BY_ROOM[roomId]) {
            socket.emit("error", "This session does not exist.");
            return;
        }
        if (SOCKETS_BY_ROOM[roomId].length >= 2) {
            socket.emit("error", "This session is full.");
            return;
        }
        UUID_BY_ID[socket.id] = uuid;
        SOCKETS_BY_ROOM[roomId].push(uuid);
        socket.join(roomId);
        io.in(roomId).fetchSockets().then(() => {
            const newWorld = new GameWorld({
                team1: SOCKETS_BY_ROOM[roomId][0],
                team2: SOCKETS_BY_ROOM[roomId][1],
                trackChanges: true,
            });
            GAME_WORLDS_ID_MAP[newWorld.id] = newWorld;
            newWorld.generateMap();
            newWorld.initiate({
                team1: team1,
                team2: team2,
            });
            newWorld.startTurn();
            GAME_WORLDS_MAP[SOCKETS_BY_ROOM[roomId][0]] = newWorld;
            GAME_WORLDS_MAP[SOCKETS_BY_ROOM[roomId][1]] = newWorld;
            io.in(roomId).emit("join-session", newWorld.id);
        });
    });
    socket.on("ready", ({ uuid }) => {
        const world = GAME_WORLDS_MAP[uuid];
        socket.emit("response", world.state.lastChangeSequence);
    });

    // il faudra trouver un moyen de batch plusieurs responses de sockets
    socket.on("request preview movement", ({ uuid, unitId }: { uuid: string, unitId: string }) => {
        const world = GAME_WORLDS_MAP[uuid];
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
        uuid: string,
        roomId: string,
        x: number,
        y: number
    }) => {
        const world = GAME_WORLDS_MAP[payload.uuid];
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
    }).on("request preview battle", (payload: { unit: string, uuid: string, x: number, y: number, position: MapCoords, path: MapCoords[] }) => {
        const gameWorld = GAME_WORLDS_MAP[payload.uuid];
        const preview = gameWorld.previewCombat(payload.unit, { x: payload.x, y: payload.y }, payload.position, payload.path);
        socket.emit("response preview battle", preview);
    }).on("request freeze unit", (payload: {
        unitId: string,
        x: number,
        uuid: string,
        roomId: string,
        y: number
    }) => {
        const world = GAME_WORLDS_MAP[payload.uuid];
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
        const world = GAME_WORLDS_MAP[payload.uuid];
        const combatActions = world.runCombat(payload.unitId, payload.attackerCoordinates, { x: payload.x, y: payload.y }, payload.path);
        io.in(payload.roomId).emit("response", combatActions);
    }).on("request preview assist", (payload: { source: string, uuid: string, sourceCoordinates: MapCoords, targetCoordinates: MapCoords }) => {
        const world = GAME_WORLDS_MAP[payload.uuid];
        const preview = world.previewAssist(payload.source, payload.targetCoordinates, payload.sourceCoordinates);
        socket.emit("response preview assist", preview);
    }).on("request confirm assist", (payload: { source: string, uuid: string, targetCoordinates: MapCoords, sourceCoordinates: MapCoords, roomId: string }) => {
        const world = GAME_WORLDS_MAP[payload.uuid];
        const assistActions = world.runAssist(payload.source, payload.targetCoordinates, payload.sourceCoordinates);
        io.in(payload.roomId).emit("response", assistActions);
    }).on("request enemy range", (payload: { sideId: string, worldId: string }) => {

    }).on("request update", (payload: { uuid: string, roomId: string }) => {
        const world = GAME_WORLDS_MAP[payload.uuid];
        const updatedEntities = parseEntities(world);
        io.in(payload.roomId).emit("update-entities", updatedEntities);
    }).on("request end turn", ({ uuid }: { uuid: string }) => {
        const world = GAME_WORLDS_MAP[uuid];
        const newTurn = world.startTurn();
        io.in(world.id).emit("response", newTurn);
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

app.post("/create", (req, res) => {

});

app.get("/worlds/:id", (req, res) => {
    const world = GAME_WORLDS_ID_MAP[req.params.id];
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

