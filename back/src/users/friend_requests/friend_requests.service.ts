import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/entities/user.entity';
import { Repository } from 'typeorm';
import { UsersService } from '../users.service';

@Injectable()
export class FriendRequestsService {
  private readonly logger = new Logger(FriendRequestsService.name);

  constructor(
    private usersService: UsersService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  private async userSentPendingFriendRequests(
    id: number,
  ): Promise<Partial<User[]>> {
    const users = await this.usersRepository.query(
      `select users.*, profiles.*
        from users
        inner join friend_requests on ("usersId_1" = users.id)
        inner join profiles on (users.id = profiles.id)
        where "usersId_2" = ${id};`,
    );
    return users.map((user): Partial<User> => {
      return {
        id: user.id,
        login_intra: user.login_intra,
        profile: {
          id: user.profile_id,
          avatar_path: user.avatar_path,
          nickname: user.nickname,
          status: user.status,
          name: user.name,
          losses: user.losses,
          wins: user.wins,
          mmr: user.mmr,
        },
      };
    });
  }

  private async userReceivedPendingFriendRequests(
    id: number,
  ): Promise<Partial<User[]>> {
    const users = await this.usersRepository.query(
      `select users.*, profiles.*
        from users
        inner join friend_requests on ("usersId_2" = users.id)
        inner join profiles on (users.id = profiles.id)
        where "usersId_1" = ${id};`,
    );
    return users.map((user): Partial<User> => {
      return {
        id: user.id,
        login_intra: user.login_intra,
        profile: {
          id: user.profile_id,
          avatar_path: user.avatar_path,
          nickname: user.nickname,
          status: user.status,
          name: user.name,
          losses: user.losses,
          wins: user.wins,
          mmr: user.mmr,
        },
      };
    });
  }

  async request(me: number, target: number) {
    const user = await this.usersService.findUserById(me);

    if (user.id == target)
      throw new BadRequestException("You can't add yourself");

    const userToAdd = await this.usersService.findUserById(target);

    if (userToAdd.friends.find((user) => user.id == me))
      throw new BadRequestException('You are already friends');

    if (userToAdd.friend_requests.find((user) => user.id == me))
      throw new BadRequestException('Friend request already been sent');

    userToAdd.friend_requests.push(user);

    this.logger.log(
      `User ${user.login_intra} send a friend request to ${userToAdd.login_intra}`,
    );

    await this.usersService.update(userToAdd);
    return await this.userSentPendingFriendRequests(me);
  }

  async cancelRequest(me: number, target: number) {
    const user = await this.usersService.findUserById(me);

    if (user.id == target)
      throw new BadRequestException(
        "You can't cancel a friend request sent to yourself",
      );

    const userToCancelRequest = await this.usersService.findUserById(target);

    if (!userToCancelRequest.friend_requests.find((user) => user.id == me))
      throw new BadRequestException(
        'You do not have a pending friend request with this user',
      );

    userToCancelRequest.friend_requests =
      userToCancelRequest.friend_requests.filter((user) => user.id != me);

    this.logger.log(
      `User ${user.login_intra} cancel a pending friend request with ${userToCancelRequest.login_intra}`,
    );

    await this.usersService.update(userToCancelRequest);
    return await this.userSentPendingFriendRequests(me);
  }

  async acceptRequest(me: number, target: number) {
    const user = await this.usersService.findUserById(me);

    if (user.id == target)
      throw new BadRequestException(
        "You can't accept a friend request sent to yourself",
      );

    const userToAccept = await this.usersService.findUserById(target);

    if (user.friends.find((userToAccept) => userToAccept.id == target))
      throw new BadRequestException('You are already friends');

    if (!user.friend_requests.find((userToAccept) => userToAccept.id == target))
      throw new BadRequestException(
        'You do not have a pending friend request with this user',
      );

    user.friend_requests = user.friend_requests.filter(
      (userToAccept) => userToAccept.id != target,
    );

    user.friends.push(await this.usersService.findUserById(target));
    userToAccept.friends.push(await this.usersService.findUserById(me));

    this.logger.log(
      `User ${user.login_intra} accepted a pending friend request with ${userToAccept.login_intra}`,
    );

    await this.usersService.update(user);
    await this.usersService.update(userToAccept);

    const updatedUser = await this.usersService.findUserById(me);
    updatedUser.friends.map((user) => {
      delete user.tfa_enabled;
      delete user.tfa_secret;
    });
    return updatedUser.friends;
  }

  async updateRequest(me: number, target: number, status: string) {
    const user = await this.usersService.findUserById(me);

    if (user.id == target)
      throw new BadRequestException(
        "You can't accept/decline a friend request sent to yourself",
      );

    const userToUpdateRequest = await this.usersService.findUserById(target);

    if (status == 'ACCEPTED') return await this.acceptRequest(me, target);
    if (status == 'DECLINED') return await this.cancelRequest(me, target);

    throw new BadRequestException('Invalid param, (ACCEPTED/DECLINED)');
  }

  async pendingRequest(me: number, type: string) {
    await this.usersService.findUserById(me);

    if (type == 'sent') return await this.userSentPendingFriendRequests(me);
    if (type == 'received')
      return await this.userReceivedPendingFriendRequests(me);

    throw new BadRequestException('Invalid param, (sent/received)');
  }
}
