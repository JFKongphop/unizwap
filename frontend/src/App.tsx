import React, { useState } from 'react';
import WalletConnect from './components/WalletConnect';
import CreatePool from './components/CreatePool';
import AddLiquidity from './components/AddLiquidity';
import SwapRouter from './components/SwapRouter';
import WithdrawRouter from './components/WithdrawRouter';
import RemoveLiquidity from './components/RemoveLiquidity';
import { WalletProvider } from './context/WalletContext';

interface Tab {
  id: string;
  name: string;
  component: React.ComponentType;
}

function App() {
  const [activeTab, setActiveTab] = useState<string>('swap');

  const tabs: Tab[] = [
    { id: 'create', name: 'Create Pool', component: CreatePool },
    { id: 'add', name: 'Add LP', component: AddLiquidity },
    { id: 'swap', name: 'Swap', component: SwapRouter },
    { id: 'withdraw', name: 'Withdraw', component: WithdrawRouter },
    { id: 'remove', name: 'Remove LP', component: RemoveLiquidity },
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || SwapRouter;

  return (
    <WalletProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950/30 to-gray-950">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
              Unizwap
            </h1>
            <WalletConnect />
          </div>

          {/* Main Card */}
          <div className="max-w-4xl mx-auto">
            <div className="bg-card rounded-2xl shadow-2xl border border-border overflow-hidden backdrop-blur-sm">
              {/* Tabs */}
              <div className="flex border-b border-border overflow-x-auto bg-card/50">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground border-b-2 border-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="p-6 bg-background/95">
                <ActiveComponent />
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center text-muted-foreground text-sm">
              <p>Private DEX powered by Zero-Knowledge Proofs</p>
            </div>
          </div>
        </div>
      </div>
    </WalletProvider>
  );
}

export default App;
