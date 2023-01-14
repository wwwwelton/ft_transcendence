import { io, Socket } from 'socket.io-client';
import { MatchState } from '../game/model/MatchState';
import { PlayerSide } from '../game/model/Paddle';
import { PlayerCommand } from '../game/model/PlayerCommand';
import { PowerUp } from '../game/model/PowerUp';
import { Match } from '../models/Match';
import { User } from '../models/User';
import api from './api';

export class GameApi {
  private readonly MATCH_MANAGER_NAMESPACE = 'match-manager';
  private matchSocket?: Socket;

  private matchId: string;

  constructor(matchId: string) {
    this.matchId = matchId;
    console.log('constructing a match api');
  }

  connectToServer() {
    const url = `${process.env.REACT_APP_BACK_HOSTNAME}/${this.MATCH_MANAGER_NAMESPACE}`;
    const options = {
      auth: {
        token: api.getToken(),
      },
    };
    this.matchSocket = io(url, options);
    this.matchSocket.on('connect', () => {
      console.log(
        `${this.MATCH_MANAGER_NAMESPACE} socket connected to the server`,
      );
    });

    this.matchSocket.on('disconnect', () => {
      console.log(`connection for socket ${this.MATCH_MANAGER_NAMESPACE} lost`);
    });

    this.matchSocket.on('connect_error', (err) => {
      console.error('error connecting to the server', err);
    });
  }

  connectAsPlayer() {
    if (!this.matchSocket) throw new Error('Not connected to the server');
    this.matchSocket.emit('connect-as-player', {
      match_id: this.matchId,
    });
  }

  connectAsSpectator() {
    if (!this.matchSocket) throw new Error('Not connected to the server');
    this.matchSocket.emit('connect-as-spectator', {
      match_id: this.matchId,
    });
  }

  setOnMatchTickListener(callback: (state: MatchState) => void) {
    if (!this.matchSocket) {
      throw new Error('match socket is not set');
    }
    this.matchSocket?.on('match-tick', (matchData) => {
      callback(matchData);
    });
  }

  setOnPowerUpSpawnListener(callback: (powerup: PowerUp) => void) {
    this.matchSocket?.on('powerup-spawn', (powerup) => {
      callback(powerup);
    });
  }

  setOnPowerUpCollectedListener(
    callback: (powerup: PowerUp, side: PlayerSide) => void,
  ) {
    type PowerUpCollectedPayload = {
      powerup: PowerUp;
      playerSide: PlayerSide;
    };
    this.matchSocket?.on(
      'powerup-collected',
      (data: PowerUpCollectedPayload) => {
        callback(data.powerup, data.playerSide);
      },
    );
  }

  issueCommand(command: PlayerCommand) {
    if (!this.matchSocket) {
      throw new Error('match socket is not set');
    }
    this.matchSocket.emit('player-command', {
      match_id: this.matchId,
      command: command,
    });
  }

  async getGameRules() {
    return (await api.getClient().get('/matches/rules')).data;
  }

  async getMatchInfo(matchId: string): Promise<Match> {
    return (await api.getClient().get(`/matches/${matchId}`)).data;
  }
}

// export default new MatchApi();
