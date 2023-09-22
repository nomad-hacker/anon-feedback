
import "dotenv/config";
import { ethers } from 'ethers';


const provider = new ethers.providers.JsonRpcProvider(process.env.JSON_RPC_API_URL);


const contractAbi = [

{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"houseId","type":"uint256"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"address[]","name":"initialMembers","type":"address[]"}],"name":"HackerHouseCreated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"houseId","type":"uint256"},{"indexed":false,"internalType":"address[]","name":"memberAddresses","type":"address[]"}],"name":"MembersAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"houseId","type":"uint256"},{"indexed":false,"internalType":"address[]","name":"memberAddresses","type":"address[]"}],"name":"MembersRemoved","type":"event"},{"inputs":[{"internalType":"uint256","name":"houseId","type":"uint256"},{"internalType":"address[]","name":"memberAddresses","type":"address[]"}],"name":"addMembers","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address[]","name":"initialMembers","type":"address[]"}],"name":"createHackerHouse","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"houseId","type":"uint256"},{"internalType":"address","name":"_memberAddress","type":"address"}],"name":"getMember","outputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"hackerHouses","outputs":[{"internalType":"address","name":"owner","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"nextHouseId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"houseId","type":"uint256"},{"internalType":"address[]","name":"memberAddresses","type":"address[]"}],"name":"removeMembers","outputs":[],"stateMutability":"nonpayable","type":"function"}


];


const contractAddress = '0x240B6EDbEaf460DC3Ba6876142692EC23bA52099';

const houseContract = new ethers.Contract(contractAddress, contractAbi, provider);


console.log('here')


//houseContract.on("HackerHouseCreated", async (sender, value, event) => {
//  console.log("Event received");
//  console.log(sender);
//  console.log(value);
//  console.log(event);
//  });


houseContract.on("HackerHouseCreated", async (data) => {
  console.log("Event received");
  console.log(data);
}); 
