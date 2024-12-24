import GameWorld from "feh-battles";
import express from "express";
import { createServer } from "http";
import bodyParser from "body-parser";
import cors from "cors";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import GAME_WORLDS from "./game-worlds";
import { Server } from "socket.io";
import debugWorld from "./debug-world";
import shortid from "short-unique-id";
const uid = new shortid({ length: 10 });

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
const roomId = uid.randomUUID();

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
    socket.join(roomId);
    socket.on("loading", () => {
        io.in(roomId).fetchSockets().then((tableau) => {
            const mappedSockets = tableau.map((i) => i.id);
            const socketIndex = mappedSockets.indexOf(socket.id); // TODO: demain, "mémoriser" les socket ids de chaque joueur
            // pour permettre aux gens de sortir, revenir, et reprendre leur partie
            const obj = {
                ids: ["bonjour", "petite-fille"],
                id: "",
            };

            if (socketIndex <= 1) {
                obj.id = ["bonjour", "petite-fille"][socketIndex];
            }
            socket.emit("allow-control", obj);
        });
    });
    socket.on("ready", () => {
        const turnStart = debugWorld.startTurn();
        io.emit("response", turnStart);
    });

    // il faudra trouver un moyen de batch plusieurs responses de sockets
    socket.on("request preview movement", ({ worldId, unitId }: { worldId: string, unitId: string }) => {
        // const world = GAME_WORLDS[worldId];
        const world = debugWorld;
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

        const stats = debugWorld.getUnitMapStats(unitId);

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
        x: number,
        y: number
    }) => {
        const world = debugWorld;
        if (world.previewUnitMovement(payload.unitId, payload)) {
            const actionEnd = world.moveUnit(payload.unitId, payload, true);
            io.emit("response confirm movement", {
                unitId: payload.unitId,
                ...payload
            });
            io.emit("response", actionEnd);

            const newState = parseEntities(debugWorld);
            io.emit("update-entities", newState);
        } else {
            const oldPosition = world.getEntity(payload.unitId)?.getOne("Position");
            io.emit("response confirm movement", {
                valid: false,
                unitId: payload.unitId,
                x: oldPosition!.x,
                y: oldPosition!.y,
            });
        }
    }).on("request preview battle", (payload: { unit: string, x: number, y: number, position: MapCoords }) => {
        const preview = debugWorld.previewCombat(payload.unit, { x: payload.x, y: payload.y }, payload.position);
        socket.emit("response preview battle", preview);
    }).on("request freeze unit", (payload: {
        unitId: string,
        x: number,
        y: number
    }) => {
        const world = debugWorld;
        world.moveUnit(payload.unitId, payload, true);
        const endAction = world.endAction(payload.unitId);
        io.emit("response confirm movement", {
            valid: true,
            unitId: payload.unitId,
            x: payload.x,
            y: payload.y,
        });
        io.emit("response", endAction);
    }).on("request confirm combat", (payload: { unitId: string, x: number, y: number, attackerCoordinates: MapCoords, path: MapCoords[] }) => {
        const combatActions = debugWorld.runCombat(payload.unitId, payload.attackerCoordinates, { x: payload.x, y: payload.y }, payload.path);
        io.emit("response", combatActions);
    }).on("request preview assist", (payload: { source: string, sourceCoordinates: MapCoords, targetCoordinates: MapCoords }) => {
        const preview = debugWorld.previewAssist(payload.source, payload.targetCoordinates, payload.sourceCoordinates);
        socket.emit("response preview assist", preview);
    }).on("request confirm assist", (payload: { source: string, targetCoordinates: MapCoords, sourceCoordinates: MapCoords }) => {
        const assistActions = debugWorld.runAssist(payload.source, payload.targetCoordinates, payload.sourceCoordinates);
        io.emit("response", assistActions);
    }).on("request danger zone", (payload: { sideId: string }) => {

    }).on("request update", () => {
        const updatedEntities = parseEntities(debugWorld);
        io.emit("update-entities", updatedEntities);
    }).on("request end turn", () => {
        const newTurn = debugWorld.startTurn();
        io.to(roomId).emit("response", newTurn);
    });
});

app.use(cors());
app.use(bodyParser.json());

const teamSchema = z.object({
    name: z.string(),
    weapon: z.string().optional(),
    assist: z.string().optional(),
    special: z.string().optional(),
    passivea: z.string().optional(),
    passiveb: z.string().optional(),
    passivec: z.string().optional(),
}).array();

app.get("/worlds/:id", (req, res) => {
    process.env.NODE_ENV = "development";
    const world = process.env.NODE_ENV === "development" ? debugWorld : GAME_WORLDS[req.params.id];
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
    // GAME_WORLDS[id] = world;
    // res.send(id);
});

server.listen(PORT, () => {
    console.log("server listening at " + PORT);
});

