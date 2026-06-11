
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
  #include <conio.h>
  #include <windows.h>
#else
  #include <fcntl.h>
  #include <termios.h>
  #include <unistd.h>
#endif

// ---------------- Terminal helpers ----------------
namespace term {

#ifdef _WIN32
void init() {
    HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
    DWORD mode = 0;
    GetConsoleMode(h, &mode);
    SetConsoleMode(h, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
    std::printf("\x1b[?25l");          // hide cursor
}
void shutdown() { std::printf("\x1b[?25h\x1b[0m\n"); }
int  readKey()  { return _kbhit() ? _getch() : -1; }
#else
termios g_old{};
void init() {
    tcgetattr(STDIN_FILENO, &g_old);
    termios raw = g_old;
    raw.c_lflag &= ~(ICANON | ECHO);
    raw.c_cc[VMIN]  = 0;
    raw.c_cc[VTIME] = 0;
    tcsetattr(STDIN_FILENO, TCSANOW, &raw);
    int fl = fcntl(STDIN_FILENO, F_GETFL, 0);
    fcntl(STDIN_FILENO, F_SETFL, fl | O_NONBLOCK);
    std::printf("\x1b[?25l");
}
void shutdown() {
    tcsetattr(STDIN_FILENO, TCSANOW, &g_old);
    std::printf("\x1b[?25h\x1b[0m\n");
}
int readKey() {
    unsigned char c;
    return (read(STDIN_FILENO, &c, 1) == 1) ? c : -1;
}
#endif

void clear() { std::printf("\x1b[2J\x1b[H"); }
void home()  { std::printf("\x1b[H"); }

} // namespace term

// ---------------- World ----------------
constexpr int MAP_W = 24;
constexpr int MAP_H = 24;

// 1-4 = wall styles, 9 = exit door, . = empty (generated + BFS-verified solvable)
static const char* MAP_SRC[MAP_H] = {
    "111111111111111111111111",
    "1.2...2...............31",
    "1.2.22..2.223...3.333.31",
    "1.2.....2.2.....3.....31",
    "1.2.22.22.223.333.3.3331",
    "1.2.2...2...3.........31",
    "1.2.222.222.333..3333.31",
    "1.2.......2.3.........31",
    "1...2222..2.3..3.3.33.31",
    "1.2.......2...........31",
    "1.2.222.2..23.3333333.31",
    "1.2.....2...3.........31",
    "1.4.444.444.4..343434.41",
    "1.4.........3...3.....31",
    "1.4.444.444.434.4.434.41",
    "1.............3.......31",
    "14444.4..4444...4.434.41",
    "1...4...4...3...3.3...31",
    "1.444.4.4.4.4..34.4.4.41",
    "1...4.....4.3.3...3...31",
    "1.4...4444444.4..3..4.41",
    "1.4.................3931",
    "144444444444434343434341",
    "111111111111111111111111",
};

struct Vec2 { double x{}, y{}; };

struct Relic { double x, y; bool taken = false; };

struct Game {
    int map[MAP_H][MAP_W]{};
    Vec2 pos{1.5, 1.5};
    Vec2 dir{0, 1};
    Vec2 plane{-0.66, 0};
    std::vector<Relic> relics{
        {1.5, 21.5}, {7.5, 15.5}, {13.5, 9.5}, {19.5, 3.5}, {1.5, 9.5}
    };
    int  collected = 0;
    bool showMap   = true;
    bool won       = false;
    bool quit      = false;
    double elapsed = 0;

    Game() {
        for (int y = 0; y < MAP_H; ++y)
            for (int x = 0; x < MAP_W; ++x) {
                char c = (x < (int)std::strlen(MAP_SRC[y])) ? MAP_SRC[y][x] : '1';
                map[y][x] = (c == '.' || c == ' ') ? 0 : (c - '0');
            }
    }

    bool solid(int x, int y) const {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return true;
        int c = map[y][x];
        if (c == 9) return collected < (int)relics.size();   // exit opens when all relics held
        return c != 0;
    }
};

// ---------------- Rendering ----------------

// shading ramps: near -> far
static const char* WALL_RAMP = "@#%xo=+:-. ";

int wallColor(int type, bool side) {
    // ANSI 256-color codes per wall type, darker on N/S faces
    switch (type) {
        case 1: return side ? 240 : 245;   // grey outer walls
        case 2: return side ?  24 :  31;   // teal
        case 3: return side ?  90 :  97;   // violet
        case 4: return side ? 130 : 172;   // amber
        case 9: return side ?  34 :  46;   // exit: green glow
        default: return 250;
    }
}

void drawFrame(const Game& g, int W, int H, std::string& out) {
    out.clear();
    out.reserve(W * H * 14);

    std::vector<double> zdist(W);
    std::vector<int>    wallTop(W), wallBot(W), wallType(W);
    std::vector<bool>   wallSide(W);

    // ---- raycast each column (classic DDA)
    for (int x = 0; x < W; ++x) {
        double camX = 2.0 * x / W - 1.0;
        double rdx = g.dir.x + g.plane.x * camX;
        double rdy = g.dir.y + g.plane.y * camX;

        int mapX = (int)g.pos.x, mapY = (int)g.pos.y;
        double ddx = (rdx == 0) ? 1e30 : std::fabs(1.0 / rdx);
        double ddy = (rdy == 0) ? 1e30 : std::fabs(1.0 / rdy);

        int stepX = rdx < 0 ? -1 : 1;
        int stepY = rdy < 0 ? -1 : 1;
        double sdx = rdx < 0 ? (g.pos.x - mapX) * ddx : (mapX + 1.0 - g.pos.x) * ddx;
        double sdy = rdy < 0 ? (g.pos.y - mapY) * ddy : (mapY + 1.0 - g.pos.y) * ddy;

        bool side = false; int hit = 0;
        for (int i = 0; i < 128 && !hit; ++i) {
            if (sdx < sdy) { sdx += ddx; mapX += stepX; side = false; }
            else           { sdy += ddy; mapY += stepY; side = true;  }
            if (mapX < 0 || mapY < 0 || mapX >= MAP_W || mapY >= MAP_H) { hit = 1; break; }
            if (g.map[mapY][mapX] != 0) hit = g.map[mapY][mapX];
        }

        double dist = side ? sdy - ddy : sdx - ddx;
        if (dist < 1e-4) dist = 1e-4;
        zdist[x] = dist;

        int lineH = (int)(H / dist);
        wallTop[x]  = std::max(0, H / 2 - lineH / 2);
        wallBot[x]  = std::min(H - 1, H / 2 + lineH / 2);
        wallType[x] = hit;
        wallSide[x] = side;
    }

    // ---- compose characters row by row
    char tmp[64];
    for (int y = 0; y < H; ++y) {
        int lastColor = -1;
        for (int x = 0; x < W; ++x) {
            char ch; int color;
            if (y < wallTop[x]) {                      // ceiling
                ch = ' '; color = 17;
            } else if (y > wallBot[x]) {               // floor, shaded by distance from horizon
                double t = (double)(y - H / 2) / (H / 2);
                ch = t > 0.66 ? '.' : (t > 0.33 ? ',' : '`');
                color = 238;
            } else {                                   // wall slice
                double d = zdist[x];
                int idx = std::min((int)(d * 0.9), (int)std::strlen(WALL_RAMP) - 1);
                ch = WALL_RAMP[idx];
                color = wallColor(wallType[x], wallSide[x]);
                if (wallType[x] == 9 && g.collected == (int)g.relics.size())
                    ch = (x + y) % 2 ? '#' : '@';      // shimmering open exit
            }
            if (color != lastColor) {
                int n = std::snprintf(tmp, sizeof tmp, "\x1b[38;5;%dm", color);
                out.append(tmp, n);
                lastColor = color;
            }
            out.push_back(ch);
        }
        out.append("\x1b[0m\n");
    }

    // ---- HUD
    int n = std::snprintf(tmp, sizeof tmp,
        "\x1b[38;5;49m RELICS %d/%d   TIME %4.0fs   ", g.collected,
        (int)g.relics.size(), g.elapsed);
    out.append(tmp, n);
    out += (g.collected == (int)g.relics.size())
        ? "\x1b[38;5;46mEXIT IS OPEN -> find the glowing door!"
        : "\x1b[38;5;245mW/S move  A/D turn  Q/E strafe  M map  X quit";
    out += "\x1b[0m\x1b[K\n";

    // ---- minimap
    if (g.showMap) {
        for (int my = 0; my < MAP_H; my += 2) {           // squash vertically
            out += ' ';
            for (int mx = 0; mx < MAP_W; ++mx) {
                if ((int)g.pos.x == mx && ((int)g.pos.y / 2) * 2 == my) { out += "\x1b[38;5;226m@"; continue; }
                bool relicHere = false;
                for (auto& r : g.relics)
                    if (!r.taken && (int)r.x == mx && ((int)r.y / 2) * 2 == my) relicHere = true;
                if (relicHere) { out += "\x1b[38;5;213m*"; continue; }
                int c = g.map[my][mx];
                if (c == 9)      out += "\x1b[38;5;46mE";
                else if (c)      out += "\x1b[38;5;240m#";
                else             out += "\x1b[38;5;236m.";
            }
            out += "\x1b[0m\x1b[K\n";
        }
    }
    out += "\x1b[J";   // clear any leftovers below
}

// ---------------- Player movement ----------------
void tryMove(Game& g, double dx, double dy) {
    const double R = 0.2;  // collision radius
    double nx = g.pos.x + dx, ny = g.pos.y + dy;
    if (!g.solid((int)(nx + (dx > 0 ? R : -R)), (int)g.pos.y)) g.pos.x = nx;
    if (!g.solid((int)g.pos.x, (int)(ny + (dy > 0 ? R : -R)))) g.pos.y = ny;
}

void rotate(Game& g, double a) {
    double c = std::cos(a), s = std::sin(a);
    double dx = g.dir.x;   g.dir.x   = dx * c - g.dir.y * s;   g.dir.y   = dx * s + g.dir.y * c;
    double px = g.plane.x; g.plane.x = px * c - g.plane.y * s; g.plane.y = px * s + g.plane.y * c;
}

// ---------------- Main ----------------
int main(int argc, char** argv) {
    int W = 100, H = 30;
    bool benchmark = false;                       // --bench renders a few frames and exits (for CI)
    for (int i = 1; i < argc; ++i)
        if (!std::strcmp(argv[i], "--bench")) benchmark = true;

    Game g;
    term::init();
    term::clear();

    std::string frame;
    auto t0 = std::chrono::steady_clock::now();
    auto prev = t0;
    int benchFrames = 0;

    while (!g.quit && !g.won) {
        auto now = std::chrono::steady_clock::now();
        double dt = std::chrono::duration<double>(now - prev).count();
        prev = now;
        g.elapsed = std::chrono::duration<double>(now - t0).count();

        // ---- input
        const double MOVE = 3.2 * dt, ROT = 2.2 * dt;
        int k;
        while ((k = term::readKey()) != -1) {
            switch (k) {
                case 'w': case 'W': tryMove(g,  g.dir.x * MOVE,  g.dir.y * MOVE); break;
                case 's': case 'S': tryMove(g, -g.dir.x * MOVE, -g.dir.y * MOVE); break;
                case 'a': case 'A': rotate(g, -ROT * 6); break;
                case 'd': case 'D': rotate(g,  ROT * 6); break;
                case 'q': case 'Q': tryMove(g,  g.dir.y * MOVE, -g.dir.x * MOVE); break;
                case 'e': case 'E': tryMove(g, -g.dir.y * MOVE,  g.dir.x * MOVE); break;
                case 'm': case 'M': g.showMap = !g.showMap; break;
                case 'x': case 'X': case 27: g.quit = true; break;
            }
        }

        // ---- relic pickup
        for (auto& r : g.relics)
            if (!r.taken) {
                double dx = r.x - g.pos.x, dy = r.y - g.pos.y;
                if (dx * dx + dy * dy < 0.36) { r.taken = true; ++g.collected; }
            }

        // ---- win check: stand in the exit cell once it's open
        if (g.collected == (int)g.relics.size() &&
            g.map[(int)g.pos.y][(int)g.pos.x] == 9) g.won = true;

        // ---- render
        drawFrame(g, W, H, frame);
        term::home();
        fwrite(frame.data(), 1, frame.size(), stdout);
        std::fflush(stdout);

        if (benchmark && ++benchFrames >= 5) break;
        std::this_thread::sleep_for(std::chrono::milliseconds(16));   // ~60 fps cap
    }

    term::shutdown();
    if (g.won)
        std::printf("\n  *** YOU ESCAPED THE ABYSS in %.0f seconds with all %d relics! ***\n\n",
                    g.elapsed, g.collected);
    else if (!benchmark)
        std::printf("\n  The maze keeps its secrets. (%d/%d relics)\n\n",
                    g.collected, (int)g.relics.size());
    return 0;
}



