import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from "@testing-library/react";
import { PlayerProvider } from "../../providers/PlayerProvider";
import { usePlayer } from "../../hooks/usePlayer";
import * as playerEngine from "../../utils/playerEngine";

function TestComponent({ callback }) {
	const playerCtx = usePlayer();
	callback && callback(playerCtx);
	return null;
}

describe("PlayerProvider", () => {
	let contextValue = null;

	function renderWithProvider(callback) {
		return render(
			<PlayerProvider>
				<TestComponent callback={callback} />
			</PlayerProvider>
		);
	}

	beforeEach(() => {
		contextValue = null;
		vi.resetAllMocks();
	});

	it("provides initial state", () => {
		renderWithProvider((ctx) => {
			contextValue = ctx;
		});
		expect(contextValue.player).toBe(null);
		expect(contextValue.lastLocalCreditChange).toBe(0);
		expect(contextValue.loading).toBe(false);
	});

	it("can login and logout", async () => {
		const fakePlayer = { userName: "test", credits: 100 };
		vi.spyOn(playerEngine, "loginPlayer").mockResolvedValue(fakePlayer);
		await act(async () => {
			renderWithProvider(async (ctx) => {
				await ctx.login({ usernameOrEmail: "test", password: "pw" });
				expect(ctx.player).toEqual(fakePlayer);
				ctx.logout();
				expect(ctx.player).toBe(null);
			});
		});
	});

	it("can addPlayer", async () => {
		const fakePlayer = { userName: "new", credits: 50 };
		vi.spyOn(playerEngine, "addPlayerApi").mockResolvedValue(fakePlayer);
		await act(async () => {
			renderWithProvider(async (ctx) => {
				await ctx.addPlayer({ userName: "new" });
				expect(ctx.player).toEqual(fakePlayer);
			});
		});
	});

	it("can updatePlayer", async () => {
		const fakePlayer = { userName: "old", credits: 10 };
		const updatedPlayer = { userName: "old", credits: 20 };
		vi.spyOn(playerEngine, "updatePlayerApi").mockResolvedValue(updatedPlayer);
		renderWithProvider((ctx) => {
			act(() => {
				ctx.setPlayer && ctx.setPlayer(fakePlayer);
			});
			act(async () => {
				await ctx.updatePlayer({ credits: 20 });
				expect(ctx.player.credits).toBe(20);
			});
		});
	});

	it("can deletePlayer", async () => {
		const fakePlayer = { userName: "del", credits: 0 };
		vi.spyOn(playerEngine, "deletePlayerApi").mockResolvedValue();
		renderWithProvider((ctx) => {
			act(() => {
				ctx.setPlayer && ctx.setPlayer(fakePlayer);
			});
			act(async () => {
				await ctx.deletePlayer();
				expect(ctx.player).toBe(null);
			});
		});
	});

	it("can updateCreditsOnServer", async () => {
		const fakePlayer = { userName: "c", credits: 10 };
		const updatedPlayer = { userName: "c", credits: 30 };
		vi.spyOn(playerEngine, "updateCreditsApi").mockResolvedValue(updatedPlayer);
		renderWithProvider((ctx) => {
			act(() => {
				ctx.setPlayer && ctx.setPlayer(fakePlayer);
			});
			act(async () => {
				await ctx.updateCreditsOnServer(30);
				expect(ctx.player.credits).toBe(30);
			});
		});
	});

	it("can addCreditsLocalOnly", () => {
		renderWithProvider((ctx) => {
			act(() => {
				ctx.setPlayer && ctx.setPlayer({ userName: "c", credits: 10 });
				ctx.addCreditsLocalOnly(15);
			});
			expect(ctx.player.credits).toBe(25);
			expect(ctx.lastLocalCreditChange).toBe(15);
		});
	});
});
