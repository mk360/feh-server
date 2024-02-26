import GameWorld from "feh-battles";
import express from "express";
import { createServer } from "http";
import bodyParser from "body-parser";
import cors from "cors";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import GAME_WORLDS from "./game-worlds";
import shortid from "shortid";
import { Server } from "socket.io";
import debugWorld from "./debug-world";

const PORT = 3600;

const app = express();

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

io.on("connection", (socket) => {
    socket.on("request preview movement", ({ worldId, unitId }: { worldId: string, unitId: string }) => {  
        // const world = GAME_WORLDS[worldId];
        const world = debugWorld;
        const movement = world?.getUnitMovement(unitId);
        const arr: number[] = [];
        movement.forEach((comp) => {
            arr.push((comp.x + 1) * 10 + comp.y + 1);
        });
        console.log(arr);
        socket.emit("response preview movement", arr);
    }).on("request confirm movement", (payload: {
        unitId: string,
        x: number,
        y: number
    }) => {
        const world = debugWorld;
        if (world.previewUnitMovement(payload.unitId, payload)) {
            const newPosition = world.moveUnit(payload.unitId, payload);
            io.emit("response confirm movement", {
                valid: true,
                unitId: payload.unitId,
                x: newPosition.x,
                y: newPosition.y,
            });
        }
        const oldPosition = world.getEntity(payload.unitId)?.getOne("Position");
        io.emit("response confirm movement", {
            valid: false,
            unitId: payload.unitId,
            x: oldPosition!.x,
            y: oldPosition!.y,
        });
    }).on("attack preview", console.log);
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

function transformHeroObject(obj: { id: string; components: any[] }) {
    const o: {
        [s: string]: any[];
    } = {};

    for (let component of obj.components) {
        const { type, ...rest } = component;
        if (!o[type]) o[type] = [];
        if (rest) o[type].push(rest);
    }

    return o;
}

app.get("/worlds/:id", (req, res) => {
    process.env.NODE_ENV = "development";
    const world = process.env.NODE_ENV === "development" ? debugWorld : GAME_WORLDS[req.params.id];
    if (world) {
        const units = Array.from(world.getEntities("Name"));
        res.status(200);
        const heroStore: {
            [k: string]: {
                [s: string]: any[]
            }
        } = {};
        for (let unit of units) {
            const objectData = unit.getObject(false);
            heroStore[objectData.id] = transformHeroObject(objectData);
        }
        res.send({
            mapId: world.state.mapId,
            heroes: heroStore
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
    const world = new GameWorld();
    world.initiate({
        team1: req.body.team1.map((i) => {
            return {
                name: i.name,
                weapon: i.weapon!,
                skills: {
                    assist: i.assist!,
                    special: i.special!,
                    A: i.passivea!,
                    B: i.passiveb!,
                    C: i.passivec!,
                    S: "",
                },
                rarity: 5,
            }
        }),
        team2: req.body.team2.map((i) => {
            return {
                name: i.name,
                weapon: i.weapon!,
                skills: {
                    assist: i.assist!,
                    special: i.special!,
                    A: i.passivea!,
                    B: i.passiveb!,
                    C: i.passivec!,
                    S: "",
                },
                rarity: 5,
            }
        }),
    });
    const id = shortid();
    GAME_WORLDS[id] = world;
    res.send(id);
});

server.listen(PORT, () => {
    console.log("server listening at " + PORT);
});

