import axios, { AxiosError } from 'axios';
import { io, Socket } from 'socket.io-client';
import { StatusCodes } from 'http-status-codes';

import {
  Channel,
  ChannelRoomAuth,
  ChannelSocketResponse,
} from '../models/Channel';
import { User } from '../models/User';

interface AuthenticationResponse {
  access_token: string;
  token_type: string;
}

export type ErrorResponse = {
  statusCode: number;
  message?: string;
  error: string;
};

class Api {
  private readonly MATCH_MAKING_NAMESPACE = 'match-making';
  private readonly CHANNEL_NAMESPACE = 'channel';

  private client = axios.create({
    baseURL: 'http://localhost:3000',
  });

  private matchMakingSocket?: Socket;
  private channelSocket?: Socket;
  private token?: string;

  constructor() {
    console.log('Creating API class instance');
  }

  async uploadAvatar(body: FormData) {
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    };
    try {
      const response = await this.client.post<any>(
        '/profile/avatar',
        body,
        config,
      );
      // console.log(response);
      return response;
    } catch (err) {
      return (err as AxiosError).response;
    }
  }

  async addFriend(myId: number, targetId: number) {
    try {
      const response = await this.client.post<any>(
        `/users/${targetId}/friend_requests`,
        {
          user_id: myId
        }
      )
      return response;
    }
    catch (err) {
      console.log('catch', err);
      return (err as AxiosError).response;
    }
  }

  async blockUser(myId: number, targetId: number) {
    try {
      const response = await this.client.post<any>(
        `/users/${targetId}/blocked_users`,
        {
          user_id: myId
        }
      )
      return response;
    } catch (err) {
      console.log('catch', err);
      return (err as AxiosError).response;
    }
  }

  async unblockUser(myId: number, targetId: number) {
    try {
      const response = await this.client.delete<any>(
        `/users/${myId}/blocked_users`,
        {
          data: {user_id: targetId},
        }
      )
      return response;
    } catch (err) {
      console.log('catch', err);
      return (err as AxiosError).response;
    }
  }

  async uploadNickname(user: User, name: string) {
    user.profile.nickname = name;
    try {
      const response = await this.client.patch<any>(`/users/${user.id}`, {
        id: user.id,
        login_intra: user.login_intra,
        profile: {
          id: user.id,
          name: user.profile.name,
          nickname: name,
          avatar_path: user.profile.avatar_path,
        },
      });
      return response;
    } catch (err) {
      console.log('catch', err);
      return (err as AxiosError).response;
    }
  }

  connectToChannel(data: ChannelRoomAuth): Promise<ChannelSocketResponse> {
    return new Promise((resolve) => {
      this.channelSocket = io(
        `http://localhost:3000/${this.CHANNEL_NAMESPACE}`,
        {
          auth: { token: this.token },
        },
      );
      this.channelSocket.emit('join', data, (res: ChannelSocketResponse) => {
        if (res.status == StatusCodes.OK)
          console.log(`Client connected to the room ${data.room}`);
        console.log(res);
        resolve(res);
      });
    });
  }


  sendMessage(data: any) {
    this.channelSocket?.emit('chat', data);
  }

  listenMessage(callback: any) {
    this.channelSocket?.on('chat', callback);
  }

  async authenticate(code: string): Promise<string> {
    const response = await this.client.post<AuthenticationResponse>(
      '/auth/login',
      {
        code,
      },
    );

    if (response.status != 201) {
      throw new Error('Authentication failed');
    }

    return response.data.access_token;
  }

  async authenticate2fa(tfaCode: string): Promise<string> {
    const response = await this.client.post<AuthenticationResponse>(
      '/auth/2fa',
      {
        tfa_code: tfaCode,
      },
    );

    if (response.status != 201) {
      throw new Error('2FA authentication failed');
    }

    return response.data.access_token;
  }

  async getRankedUsers(): Promise<User[]> {
    const response = await this.client.get<User[]>('/users', {
      params: {
        sort: 'mmr',
        order: 'DESC',
      },
    });
    // console.log(response.data);
    return response.data;
  }

  async getChannel(id: string): Promise<Channel> {
    const response = await this.client.get<Channel>(`/channels/${id}`, {});
    // console.log(response.data);
    return response.data;
  }

  async getChannels(): Promise<Channel[]> {
    const response = await this.client.get<Channel[]>('/channels', {});
    console.log(response.data);
    return response.data;
  }

  async getUser(id: string): Promise<User> {
    const response = await this.client.get(`/users/${id}`, {});
    return response.data;
  }

  async createChannel(data: any): Promise<any> {
    try {
      const response = await this.client.post('/channels', data);
      return response;
    } catch (error) {
      return (error as AxiosError).response;
    }
  }

  findMatch(
    type: 'CLASSIC' | 'TURBO',
    onMatchFound: Function,
    onError?: Function,
  ) {
    console.log('match type: ' + type);

    const matchFound = 'match-found';
    const error = 'match-error';
    this.matchMakingSocket?.once(matchFound, (matchData) => {
      console.log('match found', matchData);
      this.matchMakingSocket?.removeAllListeners(matchFound);
      this.matchMakingSocket?.removeAllListeners(error);
      onMatchFound(matchData);
    });

    this.matchMakingSocket?.once(error, (matchData) => {
      console.log('match error', matchData);
      this.matchMakingSocket?.removeAllListeners(matchFound);
      this.matchMakingSocket?.removeAllListeners(error);
      onError?.call(matchData);
    });

    this.matchMakingSocket?.emit('enqueue', { type });
  }

  stopFindingMatch() {
    if (this.matchMakingSocket?.connected) {
      console.log('dequeueing user');
      this.matchMakingSocket.emit('dequeue');
    }
  }

  private connectToMatchMakingCoordinator() {
    const url = `http://localhost:3000/${this.MATCH_MAKING_NAMESPACE}`;
    const options = {
      auth: {
        token: this.token,
      },
    };

    this.matchMakingSocket = io(url, options);

    this.matchMakingSocket.on('connect', () => {
      console.log(
        `${this.MATCH_MAKING_NAMESPACE} socket connected to the server`,
      );
    });

    this.matchMakingSocket.on('disconnect', () => {
      console.log(`connection for socket ${this.MATCH_MAKING_NAMESPACE} lost`);
    });

    this.matchMakingSocket.on('connect_error', (err) => {
      console.error('error connecting to the server', err);
    });
  }

  setToken(token: string) {
    this.client.defaults.headers['Authorization'] = `Bearer ${token}`;
    this.token = token;
    this.connectToMatchMakingCoordinator();
  }

  removeToken() {
    this.client.defaults.headers['Authorization'] = null;
    if (this.matchMakingSocket) this.matchMakingSocket.auth = {};
    this.token = undefined;
    this.channelSocket?.disconnect();
  }
}

export default new Api();
