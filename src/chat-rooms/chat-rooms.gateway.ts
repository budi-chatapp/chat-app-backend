import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { SOCKET_EVENT } from '../constants/socket.constant';
import { JoinChatRoomDto } from './dto/join-chat-room.dto';
import { SocketUser } from 'src/utils/decorators/socket-user.decorator';
import { ISocket, TSocketUser } from 'src/types/socket.type';
import { ForbiddenException, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { SocketID } from 'src/utils/decorators/socket-id.decorator';
import { ChatRoomsService } from './chat-rooms.service';
import { Server } from 'socket.io';
import { NewMessageChatRoomDto } from './dto/new-message-chat-room.dto';

@WebSocketGateway()
export class ChatRoomsGateway {
  private readonly logger = new Logger(ChatRoomsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly chatRoomsService: ChatRoomsService) {}

  @UsePipes(new ValidationPipe())
  @SubscribeMessage(SOCKET_EVENT.JOIN_CHAT_ROOM)
  async handleJoinChatRoom(
    @ConnectedSocket() client: ISocket,
    @SocketID() socketId: string,
    @SocketUser() user: TSocketUser,
    @MessageBody() dto: JoinChatRoomDto,
  ) {
    const { _id: userId, name: userName } = user;
    const { chatRoomId } = dto;

    const isAlreadyJoined = await this.chatRoomsService.isUserParticipatedInChatRoom({
      chatRoomId,
      userId,
    });

    if (isAlreadyJoined) {
      this.logger.warn(`User ${userName} already joined chat room ${chatRoomId}`);
      return;
    }

    await this.chatRoomsService.addParticipantToChatRoom({ chatRoomId, userId });

    const event = SOCKET_EVENT.JOINED_CHAT_ROOM;
    const payload = { chatRoomId, user };

    this.server.emit(event, payload);
    this.logger.log({ emit: event, payload });
  }

  @UsePipes(new ValidationPipe())
  @SubscribeMessage(SOCKET_EVENT.NEW_MESSAGE_CHAT_ROOM)
  async handleNewMessage(
    @ConnectedSocket() client: ISocket,
    @SocketID() socketId: string,
    @SocketUser() user: TSocketUser,
    @MessageBody() dto: NewMessageChatRoomDto,
  ) {
    // console.log({ socketId, user, dto });

    const { _id: userId, name: userName } = user;
    const { chatRoomId, message } = dto;

    const isParticipant = await this.chatRoomsService.isUserParticipatedInChatRoom({
      chatRoomId,
      userId,
    });

    if (!isParticipant) {
      throw new ForbiddenException(`User ${userName} not participant chat room ${chatRoomId}`);
    }

    const chat = await this.chatRoomsService.addChatToChatRoom({ chatRoomId, userId, message });

    const event = SOCKET_EVENT.NEW_MESSAGE_CHAT_ROOM;
    const payload = { chatRoomId, chat };

    this.server.emit(event, payload);
    this.logger.log({ emit: event, payload });
  }
}
