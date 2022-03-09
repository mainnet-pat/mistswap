import { ethers } from "hardhat";
import { expect } from "chai";
import { getBigNumber } from "@sushiswap/hardhat-framework";
import { Contract, ContractFactory } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { advanceTime } from "../utilities";



let accounts: SignerWithAddress[] | any;

let alice, bob, carol, fred: SignerWithAddress;


//WETH
let WETHToken: ContractFactory;
let wethToken: Contract;

//Fake ERC20 Tokens
let ReturnFalseERC20Mock,RevertingERC20Mock : ContractFactory;
let tokenA, tokenB: Contract;
const amountA = 50000
const amountB = 50000

//BentoBox
let BentoBox: ContractFactory;
let bentoBox: Contract;

//SushiSwapPair
let SushiSwapPair, SushiSwapFactory: ContractFactory;
let sushiSwapPair, sushiSwapFactory: Contract;

//UniswapV2Factory
let UniswapV2Factory: ContractFactory;
let uniswapV2Factory: Contract;

//SimpleStrategy
let SimpleStrategy: ContractFactory;
let simpleStrategy: Contract;


//SushiSwapSwapper
let SushiSwapSwapper: ContractFactory;
let sushiSwapSwapper: Contract;

let pair;

describe("SushiSwapSwapper", function () {
    beforeEach(async function () {
        // Setup accounts
        accounts = await ethers.getSigners();
        alice = accounts[0];
        bob = accounts[1];
        carol = accounts[2];
        fred = accounts[5]

        //Deploy WETH9
        WETHToken = await ethers.getContractFactory("WETH9Mock");
        wethToken = await WETHToken.deploy();
        await wethToken.deployed();


        //Deploy BentoBox
        BentoBox = await ethers.getContractFactory("BentoBoxMock");
        bentoBox = await BentoBox.deploy(wethToken.address);
        await bentoBox.deployed();

        //Deploy FakeTokens
        ReturnFalseERC20Mock = await ethers.getContractFactory("ReturnFalseERC20Mock");
        RevertingERC20Mock = await ethers.getContractFactory("RevertingERC20Mock");
        tokenA = await ReturnFalseERC20Mock.deploy("Token A", "A", 18, getBigNumber(1000000, 18));
        tokenB = await RevertingERC20Mock.deploy("Token B", "B", 8, getBigNumber(1000000, 8));
        await tokenA.deployed();
        await tokenB.deployed();

        //Funding Bob Address
        await tokenA.transfer(bob.address, getBigNumber(1000, 18))
        await tokenB.transfer(bob.address, getBigNumber(1000, 8))
        //Funding Carol Address
        await tokenA.transfer(carol.address, getBigNumber(1000, 18))
        await tokenB.transfer(carol.address, getBigNumber(1000, 8))
        //Funding Fred Address
        await tokenA.transfer(fred.address, getBigNumber(1000, 18))
        await tokenB.transfer(fred.address, getBigNumber(1000, 8))

        //Deploy UniswapV2Factory
        UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory")
        uniswapV2Factory = await UniswapV2Factory.deploy(alice.address);
        //Creating Pair
        const createPairTx = await uniswapV2Factory.createPair(tokenA.address, tokenB.address)
        pair = (await createPairTx.wait()).events[0].args.pair

        //Deploy SushiSwapFactory
        SushiSwapFactory = await ethers.getContractFactory("SushiSwapFactoryMock");
        sushiSwapFactory = await SushiSwapFactory.deploy(alice.address)
        await sushiSwapFactory.deployed();

        //Attach Pair to SushiSwapPair
        SushiSwapPair = await ethers.getContractFactory("SushiSwapPairMock");
        sushiSwapPair = await SushiSwapPair.attach(pair)
        
        //Adding Amount to Fake Tokens
        await tokenA.transfer(sushiSwapPair.address, getBigNumber(amountA, await tokenA.decimals()))
        await tokenB.transfer(sushiSwapPair.address, getBigNumber(amountB, await tokenB.decimals()))
        
        //Mint SushiSwapPair
        await sushiSwapPair.mint(alice.address)



        //-----------------------END OF FIRST PART------------------------------



        //-----------------------START OF SECOND PART------------------------------

        //Deploy SimpleStrategy
        SimpleStrategy = await ethers.getContractFactory("SimpleStrategyMock");
        simpleStrategy = await SimpleStrategy.deploy(alice.address, tokenA.address)
        await simpleStrategy.deployed();

        //Set Strategy
        await bentoBox.setStrategy(tokenA.address, simpleStrategy.address)
        await advanceTime(1209600)
        await bentoBox.setStrategy(tokenA.address, simpleStrategy.address)
        await bentoBox.setStrategyTargetPercentage(tokenA.address, 20)

        //Deploy SushiSwapSwapper
        SushiSwapSwapper = await ethers.getContractFactory("SushiSwapSwapper");
        sushiSwapSwapper = await SushiSwapSwapper.deploy(bentoBox.address, uniswapV2Factory.address, await uniswapV2Factory.pairCodeHash())
        await sushiSwapSwapper.deployed();

       
    })

    describe("Swap", function () {
        it("should swap", async function () {
            await tokenA.approve(bentoBox.address, getBigNumber(100))
            await bentoBox.deposit(tokenA.address, alice.address, alice.address, getBigNumber(100), 0)
            await bentoBox.transfer(tokenA.address, alice.address, sushiSwapSwapper.address, getBigNumber(20))
            await expect(sushiSwapSwapper.swap(tokenA.address, tokenB.address, alice.address, 0, getBigNumber(20)))
                .to.emit(tokenA, "Transfer")
                .withArgs(bentoBox.address, sushiSwapPair.address, "20000000000000000000")
                .to.emit(bentoBox, "LogWithdraw")
                .withArgs(tokenA.address, sushiSwapSwapper.address, sushiSwapPair.address, "20000000000000000000", "20000000000000000000")
                .to.emit(tokenB, "Transfer")
                .withArgs(sushiSwapPair.address, bentoBox.address, "1993205109")
                .to.emit(bentoBox, "LogDeposit")
                .withArgs(tokenB.address, bentoBox.address, alice.address, "1993205109", "1993205109")
        })

        it("should swap with minimum set", async function () {
            await tokenA.approve(bentoBox.address, getBigNumber(100))
            await bentoBox.deposit(tokenA.address, alice.address, alice.address, getBigNumber(100), 0)
            await bentoBox.transfer(tokenA.address, alice.address, sushiSwapSwapper.address, getBigNumber(20))
            await expect(sushiSwapSwapper.swap(tokenA.address, tokenB.address, alice.address, "1993205109", getBigNumber(20)))
                .to.emit(tokenA, "Transfer")
                .withArgs(bentoBox.address, sushiSwapPair.address, "20000000000000000000")
                .to.emit(bentoBox, "LogWithdraw")
                .withArgs(tokenA.address, sushiSwapSwapper.address, sushiSwapPair.address, "20000000000000000000", "20000000000000000000")
                .to.emit(tokenB, "Transfer")
                .withArgs(sushiSwapPair.address, bentoBox.address, "1993205109")
                .to.emit(bentoBox, "LogDeposit")
                .withArgs(tokenB.address, bentoBox.address, alice.address, "1993205109", "1993205109")
        })

        it("should not swap with minimum not met", async function () {
            await tokenA.approve(bentoBox.address, getBigNumber(100))
            await bentoBox.deposit(tokenA.address, alice.address, alice.address, getBigNumber(100), 0)
            await bentoBox.transfer(tokenA.address, alice.address, sushiSwapSwapper.address, getBigNumber(20))
            await expect(
                sushiSwapSwapper.swap(tokenA.address, tokenB.address, alice.address, "1993205110", getBigNumber(20))
            ).to.be.revertedWith("BoringMath: Underflow")
        })

        it("should swap in opposite direction", async function () {
            await tokenB.approve(bentoBox.address, getBigNumber(100, 8))
            await bentoBox.deposit(tokenB.address, alice.address, alice.address, getBigNumber(100, 8), 0)
            await bentoBox.transfer(tokenB.address, alice.address, sushiSwapSwapper.address, getBigNumber(20, 8))
            await expect(sushiSwapSwapper.swap(tokenB.address, tokenA.address, alice.address, 0, getBigNumber(20, 8)))
                .to.emit(tokenB, "Transfer")
                .withArgs(bentoBox.address, sushiSwapPair.address, "2000000000")
                .to.emit(bentoBox, "LogWithdraw")
                .withArgs(tokenB.address, sushiSwapSwapper.address, sushiSwapPair.address, "2000000000", "2000000000")
                .to.emit(tokenA, "Transfer")
                .withArgs(sushiSwapPair.address, bentoBox.address, "19932051098022108783")
                .to.emit(bentoBox, "LogDeposit")
                .withArgs(tokenA.address, bentoBox.address, alice.address, "19932051098022108783", "19932051098022108783")
        })

        it("should swap in opposite direction with minimum set", async function () {
            await tokenB.approve(bentoBox.address, getBigNumber(100, 8))
            await bentoBox.deposit(tokenB.address, alice.address, alice.address, getBigNumber(100, 8), 0)
            await bentoBox.transfer(tokenB.address, alice.address, sushiSwapSwapper.address, getBigNumber(20, 8))
            await expect(sushiSwapSwapper.swap(tokenB.address, tokenA.address, alice.address, "19932051098022108783", getBigNumber(20, 8)))
                .to.emit(tokenB, "Transfer")
                .withArgs(bentoBox.address, sushiSwapPair.address, "2000000000")
                .to.emit(bentoBox, "LogWithdraw")
                .withArgs(tokenB.address, sushiSwapSwapper.address, sushiSwapPair.address, "2000000000", "2000000000")
                .to.emit(tokenA, "Transfer")
                .withArgs(sushiSwapPair.address, bentoBox.address, "19932051098022108783")
                .to.emit(bentoBox, "LogDeposit")
                .withArgs(tokenA.address, bentoBox.address, alice.address, "19932051098022108783", "19932051098022108783")
        })

        it("should not swap in opposite direction with minimum not met", async function () {
            await tokenB.approve(bentoBox.address, getBigNumber(100, 8))
            await bentoBox.deposit(tokenB.address, alice.address, alice.address, getBigNumber(100, 8), 0)
            await bentoBox.transfer(tokenB.address, alice.address, sushiSwapSwapper.address, getBigNumber(20, 8))
            await expect(
                sushiSwapSwapper.swap(tokenB.address, tokenA.address, alice.address, "19932051098022108784", getBigNumber(20, 8))
            ).to.be.revertedWith("BoringMath: Underflow")
        })
    })

    describe("Swap Exact", function () {
        it("should swap exact", async function () {
            await tokenA.approve(bentoBox.address, getBigNumber(100))
            await bentoBox.deposit(tokenA.address, alice.address, alice.address, getBigNumber(100), 0)
            await bentoBox.transfer(tokenA.address, alice.address, sushiSwapSwapper.address, getBigNumber(30))
            await expect(
                sushiSwapSwapper.swapExact(
                    tokenA.address,
                    tokenB.address,
                    alice.address,
                    bob.address,
                    getBigNumber(30),
                    getBigNumber(20, 8)
                )
            )
                .to.emit(tokenA, "Transfer")
                .withArgs(bentoBox.address, sushiSwapPair.address, "20068207824754776535")
                .to.emit(bentoBox, "LogWithdraw")
                .withArgs(tokenA.address, sushiSwapSwapper.address, sushiSwapPair.address, "20068207824754776535", "20068207824754776535")
                .to.emit(tokenB, "Transfer")
                .withArgs(sushiSwapPair.address, bentoBox.address, "2000000000")
                .to.emit(bentoBox, "LogDeposit")
                .withArgs(tokenB.address, bentoBox.address, alice.address, "2000000000", "2000000000")
                .to.emit(bentoBox, "LogTransfer")
                .withArgs(tokenA.address, sushiSwapSwapper.address, bob.address, "9931792175245223465")
        })

        it("should swap exact with exact amountIn", async function () {
            await tokenA.approve(bentoBox.address, getBigNumber(100))
            await bentoBox.deposit(tokenA.address, alice.address, alice.address, getBigNumber(100), 0)
            await bentoBox.transfer(tokenA.address, alice.address, sushiSwapSwapper.address, "20068207824754776535")
            await expect(
                sushiSwapSwapper.swapExact(
                    tokenA.address,
                    tokenB.address,
                    alice.address,
                    bob.address,
                    "20068207824754776535",
                    getBigNumber(20, 8)
                )
            )
                .to.emit(tokenA, "Transfer")
                .withArgs(bentoBox.address, sushiSwapPair.address, "20068207824754776535")
                .to.emit(bentoBox, "LogWithdraw")
                .withArgs(tokenA.address, sushiSwapSwapper.address, sushiSwapPair.address, "20068207824754776535", "20068207824754776535")
                .to.emit(tokenB, "Transfer")
                .withArgs(sushiSwapPair.address, bentoBox.address, "2000000000")
                .to.emit(bentoBox, "LogDeposit")
                .withArgs(tokenB.address, bentoBox.address, alice.address, "2000000000", "2000000000")
        })

        it("should not swap exact with not enough amountIn", async function () {
            await tokenA.approve(bentoBox.address, getBigNumber(100))
            await bentoBox.deposit(tokenA.address, alice.address, alice.address, getBigNumber(100), 0)
            await bentoBox.transfer(tokenA.address, alice.address, sushiSwapSwapper.address, "20068207824754776534")
            await expect(
                sushiSwapSwapper.swapExact(
                    tokenA.address,
                    tokenB.address,
                    alice.address,
                    bob.address,
                    "20068207824754776534",
                    getBigNumber(20, 8)
                )
            ).to.be.revertedWith("BoringMath: Underflow")
        })

        it("should swap exact in opposite direction", async function () {
            await tokenB.approve(bentoBox.address, getBigNumber(100, 8))
            await bentoBox.deposit(tokenB.address, alice.address, alice.address, getBigNumber(100, 8), 0)
            await bentoBox.transfer(tokenB.address, alice.address, sushiSwapSwapper.address, getBigNumber(30, 8))
            await expect(
                sushiSwapSwapper.swapExact(
                    tokenB.address,
                    tokenA.address,
                    alice.address,
                    bob.address,
                    getBigNumber(30, 8),
                    getBigNumber(20)
                )
            )
                .to.emit(tokenB, "Transfer")
                .withArgs(bentoBox.address, sushiSwapPair.address, "2006820783")
                .to.emit(bentoBox, "LogWithdraw")
                .withArgs(tokenB.address, sushiSwapSwapper.address, sushiSwapPair.address, "2006820783", "2006820783")
                .to.emit(tokenA, "Transfer")
                .withArgs(sushiSwapPair.address, bentoBox.address, "20000000000000000000")
                .to.emit(bentoBox, "LogDeposit")
                .withArgs(tokenA.address, bentoBox.address, alice.address, "20000000000000000000", "20000000000000000000")
                .to.emit(bentoBox, "LogTransfer")
                .withArgs(tokenB.address, sushiSwapSwapper.address, bob.address, "993179217")
        })

        it("should swap exact in opposite direction with exact AmountIn", async function () {
            await tokenB.approve(bentoBox.address, getBigNumber(100, 8))
            await bentoBox.deposit(tokenB.address, alice.address, alice.address, getBigNumber(100, 8), 0)
            await bentoBox.transfer(tokenB.address, alice.address, sushiSwapSwapper.address, "2006820783")
            await expect(
                sushiSwapSwapper.swapExact(tokenB.address, tokenA.address, alice.address, bob.address, "2006820783", getBigNumber(20))
            )
                .to.emit(tokenB, "Transfer")
                .withArgs(bentoBox.address, sushiSwapPair.address, "2006820783")
                .to.emit(bentoBox, "LogWithdraw")
                .withArgs(tokenB.address, sushiSwapSwapper.address, sushiSwapPair.address, "2006820783", "2006820783")
                .to.emit(tokenA, "Transfer")
                .withArgs(sushiSwapPair.address, bentoBox.address, "20000000000000000000")
                .to.emit(bentoBox, "LogDeposit")
                .withArgs(tokenA.address, bentoBox.address, alice.address, "20000000000000000000", "20000000000000000000")
        })

        it("should not swap exact in opposite direction with not enough amountIn", async function () {
            await tokenB.approve(bentoBox.address, getBigNumber(100, 8))
            await bentoBox.deposit(tokenB.address, alice.address, alice.address, getBigNumber(100, 8), 0)
            await bentoBox.transfer(tokenB.address, alice.address, sushiSwapSwapper.address, "2006820782")
            await expect(
                sushiSwapSwapper.swapExact(tokenB.address, tokenA.address, alice.address, bob.address, "2006820782", getBigNumber(20))
            ).to.be.revertedWith("BoringMath: Underflow")
        })
    })
})
