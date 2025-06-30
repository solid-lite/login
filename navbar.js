import { html, Component } from 'https://unpkg.com/htm/preact/standalone.module.js';
import * as secp256k1 from 'https://cdn.jsdelivr.net/npm/@noble/secp256k1@1.7.1/+esm';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

// Nostr utility functions
function isValidHex(str) {
  return /^[0-9a-fA-F]{64}$/.test(str);
}

// Proper secp256k1 public key derivation using noble-secp256k1
async function deriveNostrPublicKey(privateKeyHex) {
  try {
    const publicKey = secp256k1.utils.bytesToHex(
      secp256k1.schnorr.getPublicKey(privateKeyHex)
    );
    return publicKey;
  } catch (error) {
    console.error('Error deriving public key:', error);
    return null;
  }
}

// Load DID document from nostr.social
async function loadDidDocument(publicKey) {
  try {
    const response = await fetch(`https://nostr.social/.well-known/did/nostr/${publicKey}.json`);
    if (response.ok) {
      const didDocument = await response.json();
      console.log('Loaded DID document:', didDocument);
      return didDocument;
    } else {
      console.log('DID document not found for pubkey:', publicKey);
      return null;
    }
  } catch (error) {
    console.error('Error loading DID document:', error);
    return null;
  }
}

export class Navbar extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isLoggedIn: false,
      webId: null,
      selectedPod: 'https://solidweb.me/',
      isLoading: false,
      isNostrAuth: false,
      didDocument: null,
      nostrPubkey: null,
      nostrPrivkey: null
    };
  }

  async componentDidMount() {
    await this.initializeSession();
    await this.checkNostrSession();
    // Only try clipboard auth if not already logged in
    if (!this.state.isLoggedIn) {
      await this.tryNostrClipboardAuth();
    }
  }

  async initializeSession() {
    try {
      this.setState({ isLoading: true });
      const module = await import('https://unpkg.com/@uvdsl/solid-oidc-client-browser@0.1.0/dist/esm/index.min.js');
      const Session = module.Session;
      this.session = new Session();

      await this.session.handleRedirectFromLogin();
      await this.session.restore();

      if (this.session.webId) {
        // Store Solid authentication state in localStorage
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('webId', this.session.webId);
        
        this.setState({ 
          isLoggedIn: true, 
          webId: this.session.webId 
        });
        if (this.props.onAuthChange) {
          this.props.onAuthChange(true, this.session.webId, { session: this.session });
        }
      }
    } catch (error) {
      console.error("Session initialization error:", error);
    } finally {
      this.setState({ isLoading: false });
    }
  }

  async checkNostrSession() {
    // Check if user is already logged in with Nostr
    const isNostrLoggedIn = localStorage.getItem('loggedIn') === 'true';
    const storedPubkey = localStorage.getItem('pubkey');
    const storedPrivkey = localStorage.getItem('nostr:privkey');
    
    if (isNostrLoggedIn && storedPubkey) {
      const didDocument = await loadDidDocument(storedPubkey);
      this.setState({
        isLoggedIn: true,
        webId: `did:nostr:${storedPubkey}`,
        isNostrAuth: true,
        didDocument: didDocument,
        nostrPubkey: storedPubkey,
        nostrPrivkey: storedPrivkey
      });
      if (this.props.onAuthChange) {
        this.props.onAuthChange(true, `did:nostr:${storedPubkey}`, { isNostrAuth: true, didDocument });
      }
    }

    // Check for private key in URL hash
    const hash = window.location.hash.substring(1);
    if (hash && hash.length === 64 && /^[0-9a-fA-F]+$/.test(hash)) {
      await this.loginWithNostrPrivkey(hash);
      // Clean URL by removing the hash to protect privacy
      window.history.replaceState(null, null, window.location.pathname + window.location.search);
    }
  }

  async tryNostrClipboardAuth() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        console.log('Clipboard API not available');
        return;
      }

      const clipboardText = await navigator.clipboard.readText();
      
      if (isValidHex(clipboardText)) {
        console.log('Found 64-char hex string in clipboard, attempting nostr auth...');
        
        const publicKey = await deriveNostrPublicKey(clipboardText);
        
        if (publicKey) {
          const didNostr = `did:nostr:${publicKey}`;
          console.log(`Nostr identity: ${didNostr}`);
          
          // Load DID document
          const didDocument = await loadDidDocument(publicKey);
          
          this.setState({
            isLoggedIn: true,
            webId: didNostr,
            isNostrAuth: true,
            didDocument: didDocument,
            nostrPubkey: publicKey,
            nostrPrivkey: clipboardText
          });
          
          // Store in localStorage
          localStorage.setItem('loggedIn', 'true');
          localStorage.setItem('pubkey', publicKey);
          localStorage.setItem('nostr:privkey', clipboardText);
          
          if (this.props.onAuthChange) {
            this.props.onAuthChange(true, didNostr, { isNostrAuth: true, didDocument });
          }
        }
      }
    } catch (error) {
      console.log('Clipboard access denied or failed:', error.message);
    }
  }

  handleLogin = async () => {
    if (!this.session) return;
    
    try {
      this.setState({ isLoading: true });
      const redirect_uri = window.location.href;
      await this.session.login(this.state.selectedPod, redirect_uri);
    } catch (error) {
      console.error("Login error:", error);
    } finally {
      this.setState({ isLoading: false });
    }
  };

  handleNostrLogin = async () => {
    try {
      const { value: loginMethod } = await Swal.fire({
        title: 'Login with Nostr',
        html: `
          <button id="extensionLogin" class="swal2-confirm swal2-styled" style="display:block; width:100%; margin:10px auto; background-color: #7c3aed;">Sign in with Nostr extension</button>
          <input id="privkeyInput" type="password" placeholder="Or enter your 64-character hex private key" class="swal2-input" style="display:block; width:100%; margin:10px auto;">
          <p style="margin-top: 10px; font-size: 0.9em;"><a href="https://nostrapps.github.io/extensions/" target="_blank">What is a Nostr extension?</a></p>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        focusConfirm: false,
        allowOutsideClick: true,
        customClass: {
          container: 'nostr-login-modal',
          popup: 'nostr-login-popup',
        },
        didOpen: () => {
          const extensionButton = Swal.getPopup().querySelector('#extensionLogin');
          const privkeyInput = Swal.getPopup().querySelector('#privkeyInput');

          // Clipboard auto-paste logic
          if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(text => {
              if (text && text.length === 64 && /^[0-9a-fA-F]+$/.test(text)) {
                privkeyInput.value = text;
                Swal.clickConfirm();
              }
            }).catch(() => {});
          }

          extensionButton.addEventListener('click', () => {
            Swal.clickConfirm();
          });

          privkeyInput.addEventListener('keyup', e => {
            if (e.key === 'Enter') {
              Swal.clickConfirm();
            }
          });

          privkeyInput.addEventListener('paste', e => {
            setTimeout(() => {
              if (privkeyInput.value.length === 64 && /^[0-9a-fA-F]+$/.test(privkeyInput.value)) {
                Swal.clickConfirm();
              }
            }, 10);
          });
        },
        preConfirm: () => {
          const privkey = Swal.getPopup().querySelector('#privkeyInput').value;
          if (privkey && (privkey.length !== 64 || !/^[0-9a-fA-F]+$/.test(privkey))) {
            Swal.showValidationMessage('Invalid private key format. Please enter a 64-character hex string.');
            return false;
          }
          return {
            loginMethod: privkey ? 'privkey' : 'extension',
            privkey
          };
        }
      });

      if (loginMethod) {
        if (loginMethod.loginMethod === 'privkey') {
          await this.loginWithNostrPrivkey(loginMethod.privkey);
        } else {
          const storedPrivkey = localStorage.getItem('nostr:privkey');
          if (storedPrivkey) {
            await this.loginWithNostrPrivkey(storedPrivkey);
          } else {
            await this.loginWithNostrExtension();
          }
        }
      }
    } catch (error) {
      console.error('Nostr login dialog error:', error);
    }
  };

  loginWithNostrExtension = async () => {
    if (window.nostr) {
      try {
        if (typeof window.nostr.getPublicKey !== 'function') {
          throw new Error('Nostr extension API not available');
        }

        const pubkey = await window.nostr.getPublicKey();

        if (!pubkey || !/^[0-9a-fA-F]{64}$/.test(pubkey)) {
          throw new Error('Invalid public key format returned from extension');
        }

        const didDocument = await loadDidDocument(pubkey);
        const didNostr = `did:nostr:${pubkey}`;

        this.setState({
          isLoggedIn: true,
          webId: didNostr,
          isNostrAuth: true,
          didDocument: didDocument,
          nostrPubkey: pubkey
        });

        localStorage.setItem('loggedIn', 'true');
        localStorage.setItem('pubkey', pubkey);

        Swal.fire({
          title: 'Logged in!',
          text: 'Successfully logged in with your Nostr extension.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });

        if (this.props.onAuthChange) {
          this.props.onAuthChange(true, didNostr, { isNostrAuth: true, didDocument });
        }
      } catch (error) {
        console.error('Nostr extension login failed:', error);
        Swal.fire({
          title: 'Login Failed',
          text: 'Error logging in with Nostr extension: ' + error.message,
          icon: 'error',
          timer: 2000,
          showConfirmButton: false
        });
      }
    } else {
      Swal.fire({
        title: 'Extension Not Found',
        text: 'Nostr extension not found. Please install a Nostr browser extension like nos2x or Alby.',
        icon: 'warning',
        timer: 3000,
        showConfirmButton: true
      });
    }
  };

  loginWithNostrPrivkey = async (privkey) => {
    if (privkey) {
      try {
        const pubkey = secp256k1.utils.bytesToHex(
          secp256k1.schnorr.getPublicKey(privkey)
        );

        const didDocument = await loadDidDocument(pubkey);
        const didNostr = `did:nostr:${pubkey}`;

        this.setState({
          isLoggedIn: true,
          webId: didNostr,
          isNostrAuth: true,
          didDocument: didDocument,
          nostrPubkey: pubkey,
          nostrPrivkey: privkey
        });

        localStorage.setItem('loggedIn', 'true');
        localStorage.setItem('pubkey', pubkey);
        localStorage.setItem('nostr:privkey', privkey);

        Swal.fire({
          title: 'Logged in!',
          text: 'Successfully logged in with your private key.',
          icon: 'success',
          timer: 1000,
          showConfirmButton: false
        });

        if (this.props.onAuthChange) {
          this.props.onAuthChange(true, didNostr, { isNostrAuth: true, didDocument });
        }
      } catch (error) {
        console.error('Nostr private key login failed:', error);
        Swal.fire({
          title: 'Login Failed',
          text: 'Error generating public key from private key.',
          icon: 'error',
          timer: 2000,
          showConfirmButton: false
        });
      }
    }
  };

  handleLogout = async () => {
    try {
      this.setState({ isLoading: true });
      
      if (this.state.isNostrAuth) {
        // Nostr logout
        this.setState({ 
          isLoggedIn: false, 
          webId: null,
          isNostrAuth: false,
          didDocument: null,
          nostrPubkey: null,
          nostrPrivkey: null
        });
        localStorage.setItem('loggedIn', 'false');
        localStorage.removeItem('pubkey');
        localStorage.removeItem('nostr:privkey');
        
        // Clear any textarea
        const textarea = document.querySelector('textarea');
        if (textarea) textarea.value = '';
        
        Swal.fire({
          title: 'Logged out!',
          text: 'Successfully logged out from Nostr.',
          icon: 'success',
          timer: 1000,
          showConfirmButton: false
        });
      } else if (this.session) {
        // Solid logout
        await this.session.logout();
        this.setState({ 
          isLoggedIn: false, 
          webId: null,
          isNostrAuth: false,
          didDocument: null
        });
        
        // Clear Solid authentication from localStorage
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('webId');
        localStorage.removeItem('storageEndpoint');
      }
      
      if (this.props.onAuthChange) {
        this.props.onAuthChange(false, null);
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      this.setState({ isLoading: false });
    }
  };

  handlePodChange = (e) => {
    this.setState({ selectedPod: e.target.value });
  };

  render() {
    const { isLoggedIn, webId, selectedPod, isLoading, isNostrAuth, didDocument, nostrPubkey } = this.state;

    // Generate display text and color for Nostr auth
    const displayText = isNostrAuth && nostrPubkey ? nostrPubkey.substring(0, 8) : null;
    const pubkeyColor = isNostrAuth && nostrPubkey ? `#${nostrPubkey.slice(-6)}` : '';

    return html`
      <nav style=${{
        background: 'white',
        borderBottom: '1px solid #ccc',
        padding: '1rem 2rem',
        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style=${{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style=${{
            width: '40px',
            height: '40px',
            background: '#7c3aed',
            border: '2px solid #5b21b6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: '600',
            fontSize: '1.2rem'
          }}>
            🔍
          </div>
          <div>
            <h2 style=${{
              margin: 0,
              color: '#7c3aed',
              fontSize: '1.5rem',
              fontWeight: '700'
            }}>
              Profile Debugger
            </h2>
            <p style=${{
              margin: 0,
              color: '#666',
              fontSize: '0.9rem'
            }}>
              Debug identity profiles
            </p>
          </div>
        </div>

        <div style=${{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          ${isLoggedIn ? html`
            <div style=${{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              background: '#f8f9fa',
              padding: '0.5rem 1rem',
              border: '1px solid #ddd',
              borderLeft: '4px solid #7c3aed'
            }}>
              <span style=${{ 
                color: '#555',
                fontSize: '0.9rem'
              }}>
                ${isNostrAuth ? 'Nostr DID:' : 'WebID:'}
              </span>
              <span style=${{
                color: '#7c3aed',
                fontWeight: '600',
                fontSize: '0.9rem',
                maxWidth: '200px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                ${isNostrAuth && displayText ? `${displayText}...` : webId}
              </span>
            </div>
            <button
              onClick=${this.handleLogout}
              disabled=${isLoading}
              style=${{
                background: isNostrAuth && pubkeyColor ? pubkeyColor : '#a855f7',
                color: 'white',
                border: `1px solid ${isNostrAuth && pubkeyColor ? pubkeyColor : '#9333ea'}`,
                padding: '0.5rem 1rem',
                fontSize: '0.9rem',
                fontWeight: '600',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              ${isLoading ? 'Loading...' : `Logout${isNostrAuth && displayText ? ` (${displayText})` : ''}`}
            </button>
          ` : html`
            <select
              value=${selectedPod}
              onChange=${this.handlePodChange}
              disabled=${isLoading}
              style=${{
                padding: '0.5rem',
                border: '1px solid #ccc',
                fontSize: '0.9rem',
                background: 'white',
                color: '#333',
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              <option value="https://solidweb.me/">solidweb.me</option>
              <option value="https://teamid.live/">teamid.live</option>
              <option value="https://trinpod.eu/">trinpod.eu</option>
              <option value="https://trinpod.us/">trinpod.us</option>
              <option value="https://solidcommunity.net/">solidcommunity.net</option>
              <option value="https://angelo.veltens.org/">angelo.veltens.org</option>
            </select>
            <button
              onClick=${this.handleLogin}
              disabled=${isLoading}
              style=${{
                background: '#7c3aed',
                color: 'white',
                border: '1px solid #5b21b6',
                padding: '0.5rem 1rem',
                fontSize: '0.9rem',
                fontWeight: '600',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1,
                marginRight: '0.5rem'
              }}
            >
              ${isLoading ? 'Loading...' : 'Login with Solid'}
            </button>
            <button
              onClick=${this.handleNostrLogin}
              disabled=${isLoading}
              style=${{
                background: '#f97316',
                color: 'white',
                border: '1px solid #ea580c',
                padding: '0.5rem 1rem',
                fontSize: '0.9rem',
                fontWeight: '600',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              ${isLoading ? 'Loading...' : 'Login with Nostr'}
            </button>
          `}
        </div>
      </nav>
    `;
  }
}
