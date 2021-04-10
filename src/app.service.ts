import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
    uptime = new Date();
}
