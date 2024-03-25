import GameWorld from "feh-battles";

const debugWorld = new GameWorld();

debugWorld.generateMap();

const teams = [{
    name: "Corrin: Fateful Prince",
    weapon: "Yato",
    skills: {
        A: "Atk/Res Bond 3",
        B: "Pass 3",
        C: "Atk Ploy 3",
        S: "",
        special: "Dragon Fang",
        assist: "Rally Def"
    },
    rarity: 5
}, {
    name: "Shanna: Sprightly Flier",
    weapon: "Silver Lance",
    skills: {
        A: "",
        B: "",
        C: "Guidance 3",
        S: "",
        special: "Dragon Fang",
        assist: "Pivot"
    },
    rarity: 5
}];

debugWorld.initiate({
    team1: teams,
    team2: teams,
});

export default debugWorld;
