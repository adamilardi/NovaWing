/** A level clear ends a scoped run; only campaign victory ends a campaign. */
export function isRunWin(snapshot, startLevel = null) {
    if (!snapshot) return false;
    if (snapshot.victoryPending) return true;
    return startLevel != null && Boolean(snapshot.levelCompleted ||
        snapshot.awaitingNextLevel || Number(snapshot.level) > startLevel);
}

/** Use the results card's action so its UI and listeners are cleaned up. */
export async function advanceCampaign(page, snapshot, startLevel = null) {
    if (startLevel != null || !snapshot?.awaitingNextLevel || snapshot.victoryPending) return false;
    return page.evaluate(() => {
        // The real-time heuristic runner can advance automatically between
        // reading its snapshot and this call.
        if (!awaitingNextLevel) return false;
        if (typeof resultsGamepadActions?.goNext !== 'function') {
            throw new Error('Campaign clear screen has no next-level action');
        }
        resultsGamepadActions.goNext();
        window.__novawingPilotOutcome = null;
        window.__novawingPolicyOutcome = null;
        return true;
    });
}
