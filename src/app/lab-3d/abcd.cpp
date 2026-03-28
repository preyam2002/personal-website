// clang-format off
#include<vector>
#include<string>
#include<map>
#include<set>
#include<unordered_map>
#include<algorithm>
#include<queue>
#include<tuple>
#include<unordered_set>
#include<random>
#include<utility>
#include<iostream>
#include<stack>
#include<cassert>
using namespace std;
using str = string;
#define ll long long
#define int ll
#define for1(i, j, k) for (int i=j ; i<k ; i++)
#define rep(i, j) for1(i, 0, j)
#define MP make_pair
#define PB push_back
#define EB emplace_back
#define endl "\n"
#define MOD 1000000007
#define MOD1 998244353
#define if_no(x) if(x==1) cout<<"NO"; else cout<<"YES"; cout<<endl;
#define all(x) x.begin(),x.end()
#define ff first
#define ss second
#define pii pair<int,int>
#define vi vector<int>
#pragma GCC optimize("O2","unroll-loops")
//#pragma GCC target("avx2,bmi,bmi2,popcnt,lzcnt")
#ifdef __INTELLISENSE__
#pragma diag_suppress 28,304,2140,29,1587,20,1696
#endif
// #define ONLINE_JUDGE
#ifndef ONLINE_JUDGE
template <class T1, class T2>
ostream &operator<<(ostream &os, const pair<T1, T2> &p) {return os << '{' << p.first << ", " << p.second << '}';}
template <class T, class = decay_t<decltype(*begin(declval<T>()))>,class = enable_if_t<!is_same<T, string>::value>>
ostream &operator<<(ostream &os, const T &c) {
  os << '[';
  for (auto it = c.begin(); it != c.end(); ++it)
    os << &", "[2 * (it == c.begin())] << *it;
  return os << ']';
}
#define _NTH_ARG(_1, _2, _3, _4, _5, _6, N, ...) N
#define _FE_0(_CALL, ...)
#define _FE_1(_CALL, x) _CALL(x)
#define _FE_2(_CALL, x, ...) _CALL(x) _FE_1(_CALL, __VA_ARGS__)
#define _FE_3(_CALL, x, ...) _CALL(x) _FE_2(_CALL, __VA_ARGS__)
#define _FE_4(_CALL, x, ...) _CALL(x) _FE_3(_CALL, __VA_ARGS__)
#define _FE_5(_CALL, x, ...) _CALL(x) _FE_4(_CALL, __VA_ARGS__)
#define FOR_EACH_MACRO(MACRO, ...)                                             \
  _NTH_ARG(dummy, ##__VA_ARGS__, _FE_5, _FE_4, _FE_3, _FE_2, _FE_1, _FE_0)     \
  (MACRO, ##__VA_ARGS__)
#define out(x) #x " = " << x << "; "
#define deb(...) cout << "Line " << __LINE__ << ": " FOR_EACH_MACRO(out, __VA_ARGS__) << endl; cout.flush()
#else
#define deb(...)
#endif
#define stop() static int kkkkk=0; if(++kkkkk==100) {kkkkk=0;break;}
// clang-format on
const ll INF1 = (ll)2e18 + 9;
const int INF = (int)2e9 + 1;
const int SIZE = (int)1e5 + 5;
ll w[SIZE], down[SIZE], best[SIZE], ans = -INF1;
vector<int> adj[SIZE];
void dfs1(int v, int par)
{
    down[v] = best[v] = w[v];
    ll m1 = -INF1, m2 = -INF1;
    for (auto x : adj[v])
    {
        if (x != par)
        {
            dfs1(x, v);
            best[v] = max(best[v], best[x]);
            if (down[x] > m1)
            {
                m2 = m1;
                m1 = down[x];
            }
            else if (down[x] > m2)
            {
                m2 = down[x];
            }
        }
    }
    down[v] = max(down[v], w[v] + m1);
    best[v] = max(best[v], down[v]);
    best[v] = max(best[v], w[v] + m1 + m2);
}

void dfs2(int u, int p, ll b_out, ll d_out)
{
    if (p != -1)
    {
        ans = max(ans, best[u] + b_out);
    }
    vector<pair<ll, ll>> v_info = {{d_out, b_out}};
    for (auto v : adj[u])
    {
        if (v != p)
        {
            v_info.PB({down[v], best[v]});
        }
    }
    int sz = v_info.size();
    vector<ll> pB(sz + 1, -INF), sB(sz + 1, -INF), pD(sz + 1, -INF), sD(sz + 1, -INF);
    for (int i = 0; i < sz; i++)
    {
        pB[i + 1] = max(pB[i], v_info[i].ss);
        pD[i + 1] = max(pD[i], v_info[i].ff);
    }
    for (int i = sz - 1; i >= 0; i--)
    {
        sB[i] = max(sB[i + 1], v_info[i].ss);
        sD[i] = max(sD[i + 1], v_info[i].ff);
    }
    int idx = 1;
    for (auto v : adj[u])
    {
        if (v == p)
            continue;
        ll nb = max(pB[idx], sB[idx + 1]);
        ll nd = max(pD[idx], sD[idx + 1]);
        nb = max({nb, w[u], w[u] + nd});
        dfs2(v, u, nb, max(w[u], w[u] + nd));
        idx++;
    }
}
int32_t main()
{
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int n;
    cin >> n;
    rep(i, n) cin >> w[i];
    rep(i, n - 1)
    {
        int x, y;
        cin >> x >> y;
        adj[x].PB(y);
        adj[y].PB(x);
    }
    dfs1(1, 0);
    ans = best[1];
    dfs2(1, 0, -INF, -INF);
    cout << ans << endl;
    return 0;
}
// READ IF STUCK
// Do not fall into a rabbit hole
// Easier solution exists, the problem is never too hard
// Brute force is better than clever solution
// Divide into smaller subproblem, reduce constraints to one variable
// Do we always get best answer
// Code slowly, make less mistakes