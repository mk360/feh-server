const TEAM_STORE: {
    [k: string]: any
} = {};

export function saveTeam(userId: string, teamData: any) {
    TEAM_STORE[userId] = teamData;
}

export function retrieveTeam(userId: string) {
    return TEAM_STORE[userId];
}
