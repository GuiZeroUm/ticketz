[![en](https://img.shields.io/badge/lang-en-green.svg)](README.md)
[![pt-br](https://img.shields.io/badge/lang-pt--br-red.svg)](README.pt.md)

# About the Project

Ticketz is a communicator with CRM and helpdesk features that utilizes WhatsApp as a means of communication with clients.

## Original Authorship

This project was initiated in [an Open Source project](https://github.com/canove/whaticket-community), published by the developer [Cassio Santos](https://github.com/canove) under the permissive MIT license. It later received various improvements by unidentified authors and was commercially distributed directly between developers and users with the provision of source code. According to information from [this video, it was leaked and publicly released at some point](https://www.youtube.com/watch?v=SX_cGD5RLkQ).

After some research, it was further identified that the first SaaS version of Whaticket was created by the developer [Wender Teixeira](https://github.com/w3nder), including a version of [Whaticket Single](https://github.com/unkbot/whaticket-free) that uses the Baileys library for WhatsApp access.

It is practically impossible to identify and credit the authors of the improvements. [The code published by the Vem Fazer channel](https://github.com/vemfazer/whaticket-versao-03-12-canal-vem-fazer) does not mention any license; therefore, I am assuming that all authors are comfortable with keeping these changes under the same license as the original project (MIT).

## Relicensing

As I am making these changes and providing them at no cost, I want them to be available to everyone. Therefore, I am choosing to relicense under the AGPL, which requires that every user who has access to the system can obtain the source code.

Therefore, if you directly utilize this version, it is **very important to keep the link on the "About Ticketz" screen, which provides access to the repository**. If you wish, you can move the link to the source code elsewhere, but it must be easily accessible to any system user.

If you make changes to the code, you must change the link to a repository or another way to obtain the code for your changes.

If you wish to use parts of the code to fix any code **for your own use**, feel free to do so and you don't need to worry about the AGPL license. However, if you want to use any part added in this project in a system that you commercialize, you must either provide the code of your entire system to its users, or you must contact the author of the code to license it under different criteria.

## Objective

The objective of this project is to improve and keep open updates about the published Whaticket SaaS. Mainly focused on application quality and ease of installation and use.

The improvements developed by me will be placed here, and depending on the situation, I can transpose, always crediting, codes and improvements published in other projects also derived from Whaticket Community or Whaticket SaaS.

## Contributing Back

Whenever possible, I intend to backport some adjustments made here to the original projects.

Very Quick Start on a public Server
-----------------------------------

There are Docker images provided from the project, so you can get **ticketz** to work very easily on a public server (baremetal or VPS).

### First setup

Before starting you must complete this checklist:

- [ ] Have a clean server running Ubuntu 20 or newer
- [ ] Ports 80 and 443 available and not filtered by firewall
- [ ] One hostname with configured DNS pointing to your server

After this, just log in to your server and issue the following command, replacing the hostnames you already configured and your email address:

```bash
curl -sSL get.ticke.tz | sudo bash -s app.example.com name@example.com
```

After a few minutes you will have the server running at the hostname you defined.

The default login will be the email address provided in the installation command and the default password is `123456`, you must change it right away.

### Upgrade

The upgrade is just easy as the instalation, you just need to login to your server using the same username you used on the installation and issue the following command:

```bash
curl -sSL update.ticke.tz | sudo bash
```

Your server will go down and after some minutes it will be running in the latest released version.

### Inspect logs

As all elements are running in containers the logs must be checked through the docker command.

You must login to your server using the same user you used for the installation.

First you need to move the current directory to the installation folder:

```bash
cd ~/ticketz-docker-acme
```

After this you can get a full log report with the following command:

```bash
docker compose logs -t
```

If you want to "tail follow" the logs just add a `-f` parameter to that command:

```bash
docker compose logs -t -f

```

Running From Source Code Using Docker
-------------------------------------

For installation, you need Docker Community Edition, Docker Compose and the Git
client installed. Use the best installation method for your operating system.
[The official Docker installation guide can be found here](https://docs.docker.com/engine/install/).

Clone the repository and run the commands from the project root:

```bash
git clone https://github.com/GuiZeroUm/ticketz.git
cd ticketz
```

## Running Locally: Guide for Humans and AI Agents

Local environment summary:

- There is no root `package.json`; backend and frontend are separate packages.
- The simplest path is Docker Compose from the repository root.
- The frontend is available at `http://localhost:3000/login`.
- The backend is reached by the frontend through `http://localhost:3000/backend`.
- The backend direct port defaults to `8080`, but it can be changed without
  breaking the frontend.
- The default username is `admin@ticketz.host`, and the default password is
  `123456`.

### Standard startup

Use this command when ports `3000` and `8080` are free:

```bash
docker compose -f docker-compose-local.yaml up -d --build
```

On the first run, the system initializes the database and tables. After a few
minutes, Ticketz is available at:

```text
http://localhost:3000/login
```

### When port 8080 is already in use

If another container or service already uses port `8080`, keep the frontend on
port `3000` and publish the backend on another port. This is the command used
in this environment:

```bash
BACKEND_PORT=18080 docker compose -f docker-compose-local.yaml up -d --build
```

The browser still uses `http://localhost:3000/login`. Port `18080` is only for
direct backend access from the host, when needed.

### Alternative when the backend runtime image is slow

The default `backend/Dockerfile` uses the runtime image
`ghcr.io/ticketz-oss/ticketz-node-24`. In some environments that image can be
very slow to download. For local development, this repository includes a small
override:

- `docker-compose.localruntime.yaml`
- `backend/Dockerfile.localruntime`

It changes only the local backend runtime to the official `node:24` image while
keeping Postgres, Redis, frontend, volumes and local compose environment
variables. Use it like this:

```bash
BACKEND_PORT=18080 docker compose -f docker-compose-local.yaml -f docker-compose.localruntime.yaml up -d --build
```

This alternative is meant for local development and quick startup. For internet
deployment or full runtime validation, use the project's standard compose
files.

### Verify startup

Check the containers:

```bash
BACKEND_PORT=18080 docker compose -f docker-compose-local.yaml -f docker-compose.localruntime.yaml ps
```

Check backend logs and wait for a line showing that the server started:

```bash
BACKEND_PORT=18080 docker compose -f docker-compose-local.yaml -f docker-compose.localruntime.yaml logs -f backend
```

Check HTTP:

```bash
curl -I http://localhost:3000/
curl -I http://localhost:3000/backend/
```

Both calls should return `200 OK` when the frontend, proxy and backend are
ready.

### Stop and clean

Stop while keeping the database and uploads:

```bash
BACKEND_PORT=18080 docker compose -f docker-compose-local.yaml -f docker-compose.localruntime.yaml down
```

Remove local volumes, database, Redis and uploaded files as well:

```bash
BACKEND_PORT=18080 docker compose -f docker-compose-local.yaml -f docker-compose.localruntime.yaml down -v
```

### Running on a local network

By default, the configuration is set to run the system only on the local
computer. To run it on a local network, edit `.env-backend-local` and
`.env-frontend-local` and change the backend and frontend addresses from
`localhost` to the desired IP, for example, `192.168.0.10`.

## Running and Serving on the Internet

Having a server accessible via the internet, it is necessary to adjust two DNS names of your choice, one for the backend and another for the frontend, and also an email address for certificate registration, for example:

* **backend:** api.ticketz.example.com
* **frontend:** ticketz.example.com
* **email:** ticketz@example.com

You need to edit the `.env-backend-acme` and `.env-frontend-acme` files, defining these values in them.

If you want to use reCAPTCHA in the company signup, you also need to insert the secret and site keys in the backend and frontend files, respectively.

This guide assumes that the terminal is open and logged in with a regular user who has permission to use the `sudo` command to execute commands as root.

Being in the project's root folder, execute the following command to start the service:

```bash
sudo docker compose -f docker-compose-acme.yaml up -d
```

On the first run, Docker will compile the code and create the containers, and then Ticketz will initialize the databases and tables. This operation can take quite some time, after which Ticketz will be accessible at the provided frontend address.

The default username is the email address provided on the `.env-backend-acme` file and the default password is 123456.

The application will restart automatically after each server reboot.

To terminate the service, use the following command:

```bash
sudo docker compose -f docker-compose-acme.yaml down
```

Important Notice
----------------

This project is not affiliated with Meta, WhatsApp, or any other company. The use of the provided code is the sole responsibility of the users and does not imply any liability for the author or project collaborators.

Made Your Life Easier?
----------------------

If this project has helped you with a complex task, consider making a donation to the author via PayPal or Brazilian PIX below.

[![](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=X6XHVCPMRQEL4)

![image](https://github.com/ticketz-oss/ticketz/assets/6070736/8e85b263-73ca-4fb4-9bdc-03fff356b6ff)

PIX Key: 0699c69d-0951-4686-a5b7-c6cd21aa7e15
