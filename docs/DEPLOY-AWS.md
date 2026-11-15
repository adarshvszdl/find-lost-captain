# Deploying to AWS for 300 players

## Recommendation

Run **two copies of the server on ECS Fargate behind an Application Load Balancer**, using the existing MongoDB Atlas cluster as the database.

```
players' browsers ──HTTPS──▶ Application Load Balancer ──▶ ECS Fargate task A (Node) ──┐
first mate's screen                                      └─▶ ECS Fargate task B (Node) ──┴──▶ MongoDB Atlas
```

Why this shape:

- **Copies are interchangeable.** Each copy re-reads the game state from MongoDB twice a second and pushes changes to its own players over Server-Sent Events. No sticky sessions, Redis or shared memory are needed, and a copy can die without losing anything.
- **Redundancy.** If one task fails, the load balancer stops sending traffic to it within seconds. Browsers reconnect automatically after 3 seconds and land on the healthy copy, and players keep their place because their ID is stored in the browser.
- **The load balancer handles long-lived streams.** A ping every 15 seconds keeps them open past its idle timeout.

## How much capacity 300 players needs

Measured on 13 Nov 2026 with two server copies on one laptop, against the Atlas cluster in `.env` (details in `docs/LOAD-TEST.md`):

| Players | Errors | Save a time (p50 / p99) | Host click reaches everyone (p50 / max) | Streams dropped |
| --- | --- | --- | --- | --- |
| 300 | 0 | 55 ms / 130 ms | 236 ms / 0.75 s | 0 |
| 1,000 | 0 | 55 ms / 81 ms | 244 ms / 1.35 s | 0 |

300 players is light work: about 1,400 saved times over the whole game, peaking at a few dozen per second, plus one open stream per player. Two tasks of **0.5 vCPU / 1 GB** each are plenty; one alone could carry the event.

MongoDB load is also small. Each server copy makes 2 reads per second to poll the game state. The bursts are the joins (one write each) and the result saves (one write each, about 55 ms). The rank burst at the end is answered from memory.

The Atlas cluster handled the 1,000-player test without errors. Free and shared Atlas tiers do have throughput and connection caps, so check the tier's current limits in Atlas. For extra margin on event day, a dedicated tier for a few hours costs little. The app opens at most 40 connections per server copy (`MONGO_POOL`).

## Step by step

Replace `<region>`, `<account>` and the names with your own. Put everything in **the same AWS region as the Atlas cluster** (Atlas shows the cluster's cloud region on its overview page).

### 1. Store the secrets

```bash
aws secretsmanager create-secret --region <region> --name captain-voyage/mongodb-uri --secret-string 'mongodb+srv://USER:PASSWORD@cluster0.s0ydear.mongodb.net'
aws secretsmanager create-secret --region <region> --name captain-voyage/host-key    --secret-string '<a long first-mate password>'
```

### 2. Build and push the image

```bash
aws ecr create-repository --region <region> --repository-name captain-voyage
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker build -t captain-voyage .
docker tag captain-voyage:latest <account>.dkr.ecr.<region>.amazonaws.com/captain-voyage:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/captain-voyage:latest
```

### 3. Network

- Use a VPC with **two public subnets** (for the load balancer) and **two private subnets** with a **NAT gateway** (for the tasks).
- Give the NAT gateway an Elastic IP, and add that IP to **Atlas → Network Access**. This is the only address Atlas needs to allow. Avoid `0.0.0.0/0` outside of short tests.
- Security groups:
  - The load balancer accepts 80 and 443 from anywhere.
  - Tasks accept 8080 only from the load balancer's security group.

### 4. Load balancer

- Application Load Balancer in the public subnets.
- **HTTPS listener on 443** with an ACM certificate for your domain. Port 80 redirects to 443.
- Target group:
  - target type `ip`, port 8080, protocol HTTP
  - health check path `/healthz`, interval 15 s, healthy threshold 2
  - **deregistration delay 10 s**
  - stickiness **off**
- Load balancer attributes: **idle timeout 120 s**.

### 5. ECS service

- Cluster: Fargate.
- Task definition:
  - 0.5 vCPU, 1 GB memory, container port 8080
  - environment: `MONGODB_DB=longlost_captain`, `PORT=8080`
  - secrets: `MONGODB_URI` and `HOST_KEY` from the two Secrets Manager entries. The task execution role needs `secretsmanager:GetSecretValue` on them.
  - logs to CloudWatch (awslogs driver)
- Service:
  - **desired count 2**, private subnets, attached to the target group
  - minimum healthy 100%, maximum 200%, so deploys never drop below two copies
- Auto scaling: target tracking on average CPU at 50%, minimum 2, maximum 4. It won't trigger at 300 players; it's insurance.

### 6. DNS

Point a friendly name (for example `voyage.yourcompany.com`) at the load balancer: an alias record in Route 53, or a CNAME elsewhere. Share `https://voyage.yourcompany.com/` with players. The first mate uses `https://voyage.yourcompany.com/#host`.

### 7. Prove it before the event

1. Open the site on a phone and a laptop and play a quick game end to end.
2. Run the load test against the deployed URL from an EC2 instance in the same region (see `docs/LOAD-TEST.md`). The load test opens its own new game, so run it well before the event, never during it.
3. Click **New game** afterwards to clear the test game.

## Event-day checklist

- [ ] `HOST_KEY` changed from the default and shared only with the first mate.
- [ ] Two tasks healthy in the target group; `/healthz` returns `{"ok":true}`.
- [ ] One full rehearsal game played on the deployed site from a phone.
- [ ] Open CloudWatch: target group 5xx count, target response time, ECS CPU and memory, and Atlas metrics (connections and operations).
- [ ] The first mate opens `/#host` on the shared screen 10 minutes early and clicks **Open the game**.

## A simpler option

For a one-off event, a single **EC2 t3.small** (or a Lightsail instance) running the Docker image is enough for 300 players. Put Caddy in front for automatic HTTPS.

There's no redundancy: if that machine fails mid-game, the game stops until it restarts. Players then rejoin automatically and keep their saved times, because state lives in MongoDB. Use this only if setting up ECS is not worth it.

## Rough cost

For the ECS setup running a few days:
- two small Fargate tasks: about $1.20 a day
- the load balancer: about $0.60 a day
- the NAT gateway: about $1.10 a day, plus data

Tear it down after the event, especially the NAT gateway.

## Settings that matter

- **Load balancer idle timeout must exceed 15 s.** The server pings every stream every 15 s; 120 s gives margin.
- **Don't let a CDN cache `/api/*`.** If you put CloudFront in front, forward `/api/*` uncached, with no buffering on `/api/stream`.
- **The first mate's countdown follows the server clock.** The host page corrects for its own clock offset. Players' times are measured on their own devices, so network lag never counts against them.
