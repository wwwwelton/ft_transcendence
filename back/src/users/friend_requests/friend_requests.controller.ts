import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { FriendRequestsService } from './friend_requests.service';

@Controller('/users/:from/friend_requests')
export class FriendRequestsController {
  constructor(private readonly friendRequestsService: FriendRequestsService) {}

  @HttpCode(200)
  @Post()
  async request(@Param('from') from: number, @Body('user_id') to: number) {
    return await this.friendRequestsService.request(from, to);
  }

  @Delete(':to')
  async cancelRequest(@Param('from') from: number, @Param('to') to: number) {
    return await this.friendRequestsService.cancelRequest(from, to);
  }
}
