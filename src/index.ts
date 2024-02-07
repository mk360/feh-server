import GameWorld from "feh-battles";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import GAME_WORLDS from "./game-worlds";
import shortid from "shortid";

const PORT = 3600;

const app = express();

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

interface Component {
    type: string;
    [k: string]: any;
}
interface JSONEntity {
    components: Component[];
    id: string;
    tags: string[];
}

function transformHeroObject(obj: { id: string; components: any[] }) {
    const o: {
        [k: string]: {
            [s: string]: any[];
        }
    } = { [obj.id]: {} };

    for (let component of obj.components) {
        const { type, ...rest } = component;
        if (!o[obj.id][type]) o[obj.id][type] = [];
        if (rest) o[obj.id][type].push(rest);
    }

    return o;
}

app.get("/worlds/:id", (req, res) => {
    const world = GAME_WORLDS[req.params.id];
    if (world) {
        const units = Array.from(world.getEntities("Name"));
        res.status(200);
        res.send(units.map((i) => transformHeroObject(i.getObject(false))));
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

app.listen(PORT, "localhost", () => {
    console.log("server listening at " + PORT);
});

